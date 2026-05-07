/**
 * x402 protocol helpers.
 *
 * The flow is:
 *   1. Send the request without a payment header.
 *   2. Server returns 402 with a base64-encoded `payment-required` header.
 *   3. Decode the requirements, sign an EIP-3009 USDC `transferWithAuthorization`,
 *      base64-encode the payment payload, and resend the request with the
 *      `X-PAYMENT` header set.
 *   4. Server verifies via the facilitator, settles on-chain, and returns 200
 *      with the actual response body.
 *
 * This file uses the official `x402` npm package to handle the wire format
 * shimming (V1 vs V2) and signing. We wrap it so the MakoClient surface
 * stays small and stable even if x402 internals change.
 */

import type { MakoReceipt } from "./types.js";

/**
 * Decoded payment requirements from a 402 response.
 *
 * Mirrors the schema returned by mako.pollinateresearch.com:
 *   x402Version, error, resource, accepts[], extensions
 */
export interface PaymentRequirements {
  x402Version: 1 | 2;
  error: string;
  resource: {
    url: string;
    description: string;
    mimeType: string;
  };
  accepts: Array<{
    scheme: "exact";
    network: string;
    asset: string;
    amount: string; // micro-USDC as a decimal string
    payTo: string;
    maxTimeoutSeconds: number;
    extra: { name: string; version: string };
  }>;
  extensions?: Record<string, unknown>;
}

/** Decode the base64 `payment-required` header into structured requirements. */
export function decodePaymentRequirements(headerValue: string): PaymentRequirements {
  const json = Buffer.from(headerValue, "base64").toString("utf-8");
  return JSON.parse(json) as PaymentRequirements;
}

/**
 * Convert micro-USDC string to USDC decimal.
 *
 *   "1000000" -> 1.00
 *   "20000"   -> 0.02
 */
export function microToUsdc(amountMicro: string): number {
  return Number(amountMicro) / 1_000_000;
}

/** Convert USDC decimal to micro-USDC string. */
export function usdcToMicro(amountUsdc: number): string {
  return Math.round(amountUsdc * 1_000_000).toString();
}

/**
 * Verify that a receipt's message_hash is consistent with the response body.
 *
 * MAKO computes receipts as sha256(canonical_json(body_minus_receipt))
 * with the resulting hash hex-encoded with a `0x` prefix.
 */
export async function verifyReceiptHash(
  body: Record<string, unknown>,
  receipt: MakoReceipt
): Promise<boolean> {
  if (receipt.signature_scheme !== "sha256") {
    // EIP-191 signature verification handled by callers that need it
    return false;
  }
  const { receipt: _drop, ...rest } = body as Record<string, unknown>;
  void _drop;
  const canonical = canonicalJson(rest);
  const buf = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const hex =
    "0x" +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return hex === receipt.message_hash;
}

/**
 * Stable JSON canonicalization (sorted keys, no extra whitespace) so that
 * the same body always produces the same hash regardless of property order.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") +
    "}"
  );
}
