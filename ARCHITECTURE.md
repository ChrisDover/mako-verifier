# MAKO architecture

This document describes how MAKO's four pillars relate to each other, what shared state they read from, and how a buyer agent typically composes them.

## The flywheel in one diagram

```
                   ┌──────────────────────────────────────────────────┐
                   │              MAKO verification ledger             │
                   │  (every paid /verify call appends one record)     │
                   └──────────────────────────────────────────────────┘
                                  ▲              │
                                  │              │
                       writes one │              │ reads aggregates
                          record  │              ▼
   ┌───────────┐                  │       ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  Buyer    │  POST /verify    │       │   Pulse    │  │  Pricing   │  │ Reputation │
   │  agent    │ ────────────────▶├──────▶│   $0.02    │  │   Index    │  │   Score    │
   │  (USDC)   │                  │       │  per-URL   │  │   $0.02    │  │   $0.03    │
   └───────────┘                  │       │ reliability│  │  per-cat   │  │ per-wallet │
        │                         │       └────────────┘  │ market-rate│  │ ERC-8004   │
        │                         │                       └────────────┘  │ compatible │
        │ inspects                │                                       └────────────┘
        ▼                         │                       
   ┌───────────────────────────────────┐                  
   │         target x402 service        │                  
   │   (any URL with /.well-known/      │                  
   │     x402.json + paid routes)       │                  
   └───────────────────────────────────┘                  
```

Every paid call to `/api/agent-commerce/verify` writes one verification record. Each record contains:

- The target URL probed
- The seller wallet on that URL's `payTo`
- The advertised category and price
- The actual response — was it callable? did the schema match? was the price within tolerance? did settlement succeed? what was the latency?
- Hash-anchored receipt with timestamp

That ledger is the single source of truth for the three secondary pillars. They each compute a different aggregate:

- **Pulse** groups by URL → per-endpoint reliability score
- **Pricing Index** groups by `(category, time-window)` → market-rate distribution
- **Reputation Score** groups by `payTo` wallet → per-operator trust

This is the property the v3 plan called the "network effect," but it's more precise to call it data co-location: one event source, three independently-callable views, no separate ingestion pipelines or oracles needed.

## How a buyer agent composes the pillars

Three composition patterns we've seen work well:

### Pattern 1 — Cheap pre-screen, expensive verify

For agents that call many low-stakes services per minute and only want to spend $0.25 on Verifier when something looks off:

```
1. Pulse score for the target URL          ($0.02)
2. If Pulse < threshold OR confidence is low:
3.   Verifier full check                    ($0.25)
4. Else:
5.   Make the actual paid call to target
```

Total cost per call: ~$0.02 in steady state, ~$0.27 when something's degraded. The Verifier only runs when Pulse signals there's a reason to look.

### Pattern 2 — Routing decisions

For agents that need to pick *which* equivalent service to call:

```
1. Pricing Index for the category           ($0.02)
2. Reputation Score for each candidate seller ($0.03 each)
3. Pulse for the candidate endpoints         ($0.02 each)
4. Pick the highest-Pulse / highest-Reputation
   endpoint priced at or below median.
```

Cost scales with candidate count, but the agent never spends real money on the target until the routing decision is made.

### Pattern 3 — One-shot trust check

For one-off integrations or ad-hoc agent tasks where you don't have any prior context:

```
1. Verifier with risk_mode: "strict"        ($0.25)
2. If verdict == "callable" AND score >= 70:
3.   Make the call
```

Same flow as a manual code review, just paid for and signed.

## Why each pillar is separately callable

The temptation with a stack like this is to bundle everything behind one "trust API" and charge a single subscription. We resist that for three reasons:

1. **Composability** — different agents need different subsets. A routing agent might only ever call Pricing Index. A counterparty-vetting service might only ever call Reputation Score.
2. **Honest pricing** — bundling forces a single price; per-pillar pricing means you pay $0.02 for the lookup that actually answered your question, not for the four lookups you didn't need.
3. **Independent verification** — each pillar's response carries its own hash receipt. A buyer agent that only trusts Reputation can't be coerced into accepting a Verifier verdict it didn't ask for.

## ERC-8004 alignment

Reputation Score is structurally compatible with emerging [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) trustless-agent reputation semantics. Specifically:

- The composite `score` (0–100) maps to ERC-8004's `reputation_score`
- The `tier` enum maps cleanly to ERC-8004 tier semantics
- `sub_scores` and `weights_used` are exposed explicitly so consumers can recompute the score with their own weights if they want
- The receipt is hash-anchored and verifiable, suitable for posting on-chain as an attestation

When ERC-8004 finalizes, MAKO's Reputation Score endpoint will additionally return an EIP-712-typed attestation that on-chain consumers can verify against a registry. The off-chain JSON shape will not change.

## What's not in MAKO

To keep the trust layer focused, MAKO explicitly does *not*:

- Sign transactions or vote on the buyer's behalf — pillars are informational only
- Custody USDC or hold escrow — settlement happens directly between buyer and seller via the x402 facilitator
- Provide investment, legal, tax, or compliance advice
- Block or rate-limit calls to other services — buyer agents make their own decisions

A buyer agent that ignores a `not_callable` verdict and pays anyway loses its money the same way it would have without MAKO. The receipt simply records that the verifier said "don't" before the call happened.

## Reference deployment internals (for self-hosters)

The reference deployment at `mako.pollinateresearch.com` is a FastAPI service running on Heroku, with:

- **Storage:** append-only JSONL ledger for verification records (rotated to S3 nightly)
- **Caching:** 60-second in-process cache for Pulse scoreboard renders
- **Facilitator:** Coinbase CDP `/platform/v2/x402` for production, `x402.org/facilitator` as fallback. The CDP V2 endpoint accepts both V1 and V2 payloads, but its V2 schema diverges from the official x402 V2 spec; the reference deployment shims V2 SDK output back to V1 wire format for stability. (The signed message is over `chain_id`, which `base` and `eip155:8453` both resolve to `8453`, so the same EIP-3009 signature works for both.)
- **Discovery:** `/.well-known/x402.json` is served from the live route table at request time, so any route changes are reflected immediately

If you want to run your own MAKO instance, the contract is:

1. Serve `/.well-known/x402.json` with the same shape (see the live response for the reference)
2. Implement at least one of the four paid pillars
3. Configure a Base mainnet `payTo` wallet
4. Wire to a CDP-compatible x402 facilitator

The SDK in this repo will then work against your endpoint via `new MakoClient({ baseUrl: "https://your-mako" })`.
