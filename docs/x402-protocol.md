# x402 protocol notes for MAKO integrators

This page covers what an SDK author or buyer-agent integrator needs to know about how MAKO uses x402 in production. For the full x402 spec see [docs.x402.org](https://docs.x402.org).

## The two-roundtrip flow

```
Buyer agent                          MAKO                              CDP facilitator
    │                                  │                                       │
    │  GET /api/pulse/score?endpoint=… │                                       │
    │  ──────────────────────────────▶ │                                       │
    │                                  │                                       │
    │  402 Payment Required            │                                       │
    │  payment-required: <base64 …>    │                                       │
    │  ◀────────────────────────────── │                                       │
    │                                  │                                       │
    │  (decode requirements,           │                                       │
    │   sign EIP-3009 USDC             │                                       │
    │   transferWithAuthorization,     │                                       │
    │   base64 the payload)            │                                       │
    │                                  │                                       │
    │  GET /api/pulse/score?endpoint=… │                                       │
    │  X-PAYMENT: <base64 …>           │                                       │
    │  ──────────────────────────────▶ │                                       │
    │                                  │  POST /verify { payload, requirements }│
    │                                  │  ────────────────────────────────────▶│
    │                                  │                                       │
    │                                  │  { verified: true }                   │
    │                                  │  ◀──────────────────────────────────  │
    │                                  │                                       │
    │                                  │  POST /settle { payload }             │
    │                                  │  ────────────────────────────────────▶│
    │                                  │                                       │
    │                                  │  { settled, txHash }                  │
    │                                  │  ◀──────────────────────────────────  │
    │                                  │                                       │
    │  200 OK                          │                                       │
    │  X-PAYMENT-RESPONSE: <base64 …>  │                                       │
    │  { actual response body }        │                                       │
    │  ◀────────────────────────────── │                                       │
```

The buyer's wallet signs once. The facilitator does verification and settlement in parallel. End-to-end latency for a paid call to MAKO is typically 800–1500ms on Base (the bulk being the L2 settlement).

## The `payment-required` header

A 402 response includes `payment-required` as a base64-encoded JSON document. Decoded, it looks like:

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "https://mako.pollinateresearch.com/api/pulse/score",
    "description": "_MAKO Pulse: …",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:8453",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "20000",
      "payTo": "0x6e4DfBe49858E9Cb93162352D75DBD1E409A7737",
      "maxTimeoutSeconds": 300,
      "extra": { "name": "USD Coin", "version": "2" }
    }
  ],
  "extensions": { "bazaar": { … } }
}
```

`amount` is in micro-USDC (6 decimals), so `"20000"` = $0.02. `maxTimeoutSeconds: 300` is the EIP-3009 authorization validity window.

## V1 vs V2 wire format

The official x402 SDK emits V2 payloads. Coinbase CDP's facilitator at `/platform/v2/x402` accepts both, but its V2 schema diverges from the official x402 V2 spec in a way that has caused incompatibility for some operators. The MAKO reference deployment shims V2 SDK output back to V1 wire format before forwarding to CDP — this is implemented in `_CDPCompatFacilitatorClient` in the operator's private repo.

For this SDK: the underlying `x402` npm package handles V1/V2 negotiation transparently. You don't need to think about it.

## EIP-3009 vs EIP-2612

x402 uses EIP-3009 (`transferWithAuthorization`) rather than EIP-2612 (`permit`) because:

- EIP-3009 authorizations are scoped to a single recipient and amount, which matches the per-call payment model.
- EIP-3009 authorizations have a built-in nonce (random 32 bytes), so replay protection is per-authorization, not per-wallet-counter.
- EIP-3009 authorizations are accepted by USDC on Base, Polygon, Ethereum mainnet, and other major networks without contract changes.

## Network IDs

MAKO uses `eip155:8453` (Base mainnet) in V2 payloads. The CDP facilitator's V1 endpoint expects the alias `base`. Both resolve to chain ID `8453`, so the same EIP-3009 signature is valid for both. The shim handles the alias mapping.

If you self-host MAKO on a different network, set `MAKO_X402_NETWORK` to the appropriate `eip155:<chainId>` and update your facilitator's network alias map.

## Receipts

Every paid response from MAKO includes a `receipt` field:

```json
"receipt": {
  "message_hash": "0x…",
  "signature_scheme": "sha256"
}
```

The hash is computed as `sha256(canonical_json(body_minus_receipt))`. The SDK's `verifyReceipt(response)` method recomputes and compares. This protects against transit-layer tampering between MAKO and the buyer agent (TLS already protects the network path, but the receipt provides an additional integrity proof you can persist alongside the response for later audit).

When ERC-8004 finalizes, MAKO will additionally return EIP-191 signatures over the same hash, signed by MAKO's operator key, so on-chain consumers can verify the response against a registry-listed public key.

## Idempotency

x402 calls are not idempotent — each call signs a fresh authorization with a new nonce. If a network error causes the buyer agent to retry, it pays twice. To get idempotent semantics, either:

1. Retry only on errors that occurred before the `X-PAYMENT-RESPONSE` header arrived (i.e., before settlement), or
2. Use a higher-level orchestrator that tracks `(target_url, intended_task)` → `record_id` mappings and skips duplicates.

The SDK does not implement either of these. Buyer agents that need exactly-once semantics should layer them on top.
