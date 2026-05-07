/**
 * MAKO response types — mirror the live shape returned by mako.pollinateresearch.com.
 *
 * Source of truth: https://mako.pollinateresearch.com/.well-known/x402.json
 *
 * If a field changes upstream, update this file and bump the SDK minor version.
 */

export type Verdict = "callable" | "proceed_with_caution" | "not_callable";
export type RiskMode = "standard" | "strict";
export type Window = "7d" | "30d" | "90d" | "all";
export type PricingWindow = "7d" | "30d" | "all";
export type Confidence = "high" | "medium" | "low" | "none";
export type EndpointStatus = "healthy" | "degraded" | "down" | "unknown";
export type ReputationTier =
  | "trusted"
  | "reliable"
  | "developing"
  | "unreliable"
  | "unknown";

export type PricingCategory =
  | "crypto_intelligence"
  | "trading_signals"
  | "governance"
  | "compliance"
  | "trust_layer"
  | "data_feeds"
  | "ai_inference"
  | "agent_infrastructure"
  | "other";

/** Hash-anchored receipt returned with every paid response. */
export interface MakoReceipt {
  message_hash: string;
  signature_scheme: "sha256" | "eip-191";
}

/** Verifier ($0.25) — POST /api/agent-commerce/verify */
export interface VerifyRequest {
  /** Paid agent or x402 service URL. Base URLs are resolved to /.well-known/x402.json. */
  target_url: string;
  /** Free-text description of what the buyer agent intends to do. Max 300 chars. */
  intended_task?: string;
  /** Maximum acceptable route price in USDC. Used to scope which routes count as "callable". */
  max_price_usdc?: number;
  /** Desired output format. Most commonly "json". */
  required_output?: string;
  /** "strict" raises the bar for what counts as callable. */
  risk_mode?: RiskMode;
  /** Per-call timeout in seconds (3-30). */
  timeout?: number;
}

export interface VerifyResponse {
  service: "_MAKO Agent Commerce Verifier";
  verdict: Verdict;
  /** 0-100 composite score. */
  score: number;
  /** Best route on the target for the intended task, if any. */
  recommended_route: string | null;
  price_usdc: number | null;
  schema_valid: boolean;
  settlement_ready: boolean;
  warnings: string[];
  /** Pre-built call plan for the recommended route. */
  call_plan: {
    method: string;
    url: string;
    query?: Record<string, unknown>;
    body?: Record<string, unknown> | null;
  } | null;
  receipt: MakoReceipt;
}

/** Pulse ($0.02) — GET /api/pulse/score */
export interface PulseRequest {
  endpoint: string;
  window?: Window;
}

export interface PulseResponse {
  service: "_MAKO Pulse";
  endpoint: string;
  reliability_score: number | null;
  status: EndpointStatus;
  window: Window;
  verifications: {
    total: number;
    callable: number;
    not_callable: number;
    degraded: number;
  };
  rates: {
    callable_rate: number;
    schema_compliance_rate: number;
    settlement_success_rate: number;
  };
  latency: {
    p50_ms: number | null;
    p95_ms: number | null;
  };
  first_seen_at: string | null;
  last_verified_at: string | null;
  confidence: Confidence;
  warnings_summary: Array<{ warning: string; count: number }>;
  receipt: MakoReceipt;
}

/** Pricing Index ($0.02) — GET /api/pricing/index */
export interface PricingIndexRequest {
  /** Omit for a market-wide breakdown across all categories. */
  category?: PricingCategory;
  window?: PricingWindow;
}

export interface PricingDistribution {
  min: number;
  p25: number;
  median: number;
  mean: number;
  p75: number;
  p95: number;
  max: number;
}

export interface PricingIndexResponse {
  service: "_MAKO Pricing Index";
  category: PricingCategory | null;
  window: PricingWindow;
  sample_size: {
    verifications: number;
    unique_endpoints: number;
  };
  /** Per-category response (when `category` was supplied). */
  pricing_usdc?: PricingDistribution | null;
  endpoint_count_by_price_band?: Record<string, number> | null;
  /** Market-wide response (when `category` was omitted). */
  by_category?: Record<PricingCategory, PricingDistribution> | null;
  overall_pricing_usdc?: PricingDistribution | null;
  freshness_hours: number | null;
  confidence: Confidence;
  computed_at: string;
  receipt: MakoReceipt;
}

/** Reputation Score ($0.03) — GET /api/reputation/wallet */
export interface ReputationRequest {
  /** EVM seller wallet address (0x followed by 40 hex chars). Case-insensitive. */
  address: string;
  window?: Window;
}

export interface ReputationResponse {
  service: "_MAKO Reputation Score";
  wallet: string;
  chain: "eip155:8453";
  window: Window;
  reputation_score: number | null;
  tier: ReputationTier;
  confidence: Confidence;
  sub_scores: {
    callable_rate: number;
    schema_compliance_rate: number;
    settlement_success_rate: number;
    recency_factor: number;
  } | null;
  weights_used: {
    callable_rate: number;
    schema_compliance_rate: number;
    settlement_success_rate: number;
    recency_factor: number;
  } | null;
  activity: {
    total_verifications: number;
    unique_endpoints: number;
    categories_operated: PricingCategory[];
    first_seen_at: string | null;
    last_verified_at: string | null;
    days_active_in_window: number;
  };
  warnings_summary: Array<{ warning: string; count: number }>;
  computed_at: string;
  receipt: MakoReceipt;
}

/** Governance Brief ($1.00) — POST /api/governance/weekly-brief */
export interface GovernanceBriefRequest {
  client_name?: string;
  snapshot_spaces: string[];
  snapshot_states?: Array<"active" | "pending" | "closed">;
  snapshot_order_direction?: "asc" | "desc";
  tally_governor_ids?: string[];
  tally_organization_ids?: number[];
  limit?: number;
  max_summaries?: number;
  max_body_chars?: number;
  num_predict?: number;
  timeout?: number;
  skip_model?: boolean;
}

export interface GovernanceBriefResponse {
  service: "_MAKO DAO Governance Ops";
  client_name: string;
  generated_at: string;
  proposal_count: number;
  summaries_count: number;
  brief_markdown: string;
  proposal_metadata: Array<{
    title: string;
    source: "snapshot" | "tally";
    url: string;
    state: string;
  }>;
  receipt: MakoReceipt;
}

/** Configuration for the MakoClient. */
export interface MakoClientConfig {
  /** Buyer wallet client (viem WalletClient). Used to sign EIP-3009 transfer authorizations. */
  wallet: unknown; // intentionally loose to avoid forcing a viem version on consumers
  /** Override the MAKO base URL (defaults to the reference deployment). */
  baseUrl?: string;
  /** Optional fetch implementation (defaults to global fetch). */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number;
}

/** Errors */
export class MakoError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "MakoError";
  }
}

export class MakoPaymentError extends MakoError {
  constructor(
    message: string,
    public readonly paymentRequirements: unknown
  ) {
    super(message, 402);
    this.name = "MakoPaymentError";
  }
}
