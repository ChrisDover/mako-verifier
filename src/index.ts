/**
 * @pollinate/mako — TypeScript SDK for MAKO.
 *
 * The trust layer for agent commerce on Base. Four callable pillars
 * (Verifier, Pulse, Pricing Index, Reputation Score) plus the original
 * DAO Governance Ops product line, all paid in USDC via x402.
 *
 * Usage:
 *   import { MakoClient } from "@pollinate/mako";
 *   const mako = new MakoClient({ wallet });
 *   const verdict = await mako.verify({ target_url: "...", intended_task: "..." });
 */

import {
  decodePaymentRequirements,
  microToUsdc,
  verifyReceiptHash,
  type PaymentRequirements,
} from "./x402.js";
import {
  MakoError,
  MakoPaymentError,
  type MakoClientConfig,
  type VerifyRequest,
  type VerifyResponse,
  type PulseRequest,
  type PulseResponse,
  type PricingIndexRequest,
  type PricingIndexResponse,
  type ReputationRequest,
  type ReputationResponse,
  type GovernanceBriefRequest,
  type GovernanceBriefResponse,
} from "./types.js";

export * from "./types.js";
export {
  decodePaymentRequirements,
  microToUsdc,
  usdcToMicro,
  verifyReceiptHash,
  type PaymentRequirements,
} from "./x402.js";

const DEFAULT_BASE_URL = "https://mako.pollinateresearch.com";
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Client for calling MAKO's paid x402 endpoints.
 *
 * The constructor takes a viem-compatible WalletClient that signs USDC
 * transfer authorizations on Base. The wallet must be funded with at
 * least enough USDC to cover the per-call price plus gas (gasless on Base
 * if you use a paymaster).
 */
export class MakoClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly wallet: unknown;

  constructor(config: MakoClientConfig) {
    this.wallet = config.wallet;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Pillar 1 — Verifier ($0.25 USDC)
   *
   * Pre-spend trust check. Inspects the target's /.well-known/x402.json,
   * validates route schemas, checks settlement readiness, and returns a
   * machine-readable verdict with a recommended call plan.
   */
  async verify(request: VerifyRequest): Promise<VerifyResponse> {
    return this.paidPost<VerifyResponse>("/api/agent-commerce/verify", request);
  }

  /**
   * Pillar 2 — Pulse ($0.02 USDC)
   *
   * Endpoint reliability score derived from MAKO's verification ledger.
   * Returns callable rate, schema compliance, settlement success,
   * latency p50/p95, and a 0-100 score over the requested window.
   */
  async pulse(request: PulseRequest): Promise<PulseResponse> {
    return this.paidGet<PulseResponse>("/api/pulse/score", {
      endpoint: request.endpoint,
      window: request.window ?? "30d",
    });
  }

  /**
   * Pillar 3 — Pricing Index ($0.02 USDC)
   *
   * Market-rate pricing intelligence per category, or market-wide if
   * `category` is omitted. Distribution stats are computed over unique
   * endpoints (latest observed price), so popular endpoints can't skew
   * the index.
   */
  async pricingIndex(request: PricingIndexRequest = {}): Promise<PricingIndexResponse> {
    const query: Record<string, string> = { window: request.window ?? "30d" };
    if (request.category) query.category = request.category;
    return this.paidGet<PricingIndexResponse>("/api/pricing/index", query);
  }

  /**
   * Pillar 4 — Reputation Score ($0.03 USDC)
   *
   * Per-wallet operator trust derived from MAKO's verification ledger.
   * Aggregates callable rate, schema compliance, settlement readiness,
   * and recency across every x402 endpoint operated by the wallet.
   * Structurally compatible with ERC-8004.
   */
  async reputation(request: ReputationRequest): Promise<ReputationResponse> {
    return this.paidGet<ReputationResponse>("/api/reputation/wallet", {
      address: request.address,
      window: request.window ?? "30d",
    });
  }

  /**
   * DAO Governance Ops — Weekly Brief ($1.00 USDC)
   *
   * Source-linked weekly brief from Snapshot and Tally proposal data.
   * Returns Markdown plus structured proposal metadata.
   */
  async governanceWeeklyBrief(
    request: GovernanceBriefRequest
  ): Promise<GovernanceBriefResponse> {
    return this.paidPost<GovernanceBriefResponse>(
      "/api/governance/weekly-brief",
      request
    );
  }

  /**
   * Verify that a response's hash receipt matches the response body.
   * Returns true if the receipt is consistent.
   */
  async verifyReceipt(response: { receipt: { message_hash: string; signature_scheme: "sha256" | "eip-191" } } & Record<string, unknown>): Promise<boolean> {
    return verifyReceiptHash(response, response.receipt);
  }

  // ------------------------------------------------------------------
  // Private — x402 request orchestration
  // ------------------------------------------------------------------

  private async paidGet<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
    return this.paid<T>("GET", url.toString());
  }

  private async paidPost<T>(path: string, body: unknown): Promise<T> {
    return this.paid<T>("POST", this.baseUrl + path, body);
  }

  private async paid<T>(
    method: "GET" | "POST",
    url: string,
    body?: unknown
  ): Promise<T> {
    // Step 1 — initial request without payment header
    const initial = await this.fetchWithTimeout(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (initial.status !== 402) {
      // Either it succeeded without payment (unlikely for paid routes),
      // or it errored.
      return this.parseResponse<T>(initial);
    }

    // Step 2 — decode payment requirements
    const headerValue = initial.headers.get("payment-required");
    if (!headerValue) {
      throw new MakoError(
        "Server returned 402 without a payment-required header",
        402
      );
    }
    const requirements = decodePaymentRequirements(headerValue);
    void requirements; // referenced by sub-step below
    const accepted = requirements.accepts[0];
    if (!accepted) {
      throw new MakoPaymentError(
        "Server returned 402 with no acceptable payment options",
        requirements
      );
    }

    // Step 3 — sign and resend
    const paymentHeader = await this.signPayment(method, url, accepted, requirements);
    const paid = await this.fetchWithTimeout(url, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        "X-PAYMENT": paymentHeader,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    return this.parseResponse<T>(paid);
  }

  /**
   * Sign an EIP-3009 transferWithAuthorization for the requested amount,
   * base64-encode the x402 payment payload, and return the X-PAYMENT
   * header value.
   *
   * Implementation note: this delegates to the official `x402` npm
   * package's helper rather than re-implementing EIP-3009 signing, so
   * the wire format stays in sync with whatever the facilitator expects.
   */
  private async signPayment(
    method: string,
    url: string,
    accepted: PaymentRequirements["accepts"][number],
    requirements: PaymentRequirements
  ): Promise<string> {
    void method;
    void url;
    // NOTE: in a real implementation, this calls into the `x402` package:
    //
    //   import { signExactEvm } from "x402/mechanisms/evm/exact";
    //   const payload = await signExactEvm({
    //     wallet: this.wallet,
    //     scheme: accepted.scheme,
    //     network: accepted.network,
    //     asset: accepted.asset,
    //     amount: accepted.amount,
    //     payTo: accepted.payTo,
    //     resource: requirements.resource.url,
    //   });
    //   return Buffer.from(JSON.stringify(payload)).toString("base64");
    //
    // We intentionally don't ship a hard dependency on a specific x402
    // package version in this stub so the SDK builds in CI without an
    // upstream package version pin. Buyers who actually want to spend
    // USDC import `x402` themselves and pass the wallet through.
    throw new MakoError(
      `signPayment stub — install \`x402\` and replace this method. amount=${microToUsdc(accepted.amount)} USDC, payTo=${accepted.payTo}, resource=${requirements.resource.url}`
    );
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      throw new MakoError(
        `MAKO returned non-JSON response (status ${response.status})`,
        response.status,
        text
      );
    }
    if (!response.ok) {
      throw new MakoError(
        `MAKO request failed with status ${response.status}`,
        response.status,
        json
      );
    }
    return json as T;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
