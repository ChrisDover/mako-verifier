# MAKO

> The trust layer for agent commerce on Base. One call to route x402 spend safely.

[![x402](https://img.shields.io/badge/x402-Base-blue)](https://x402.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Listed on agentic.market](https://img.shields.io/badge/listed-agentic.market-black)](https://agentic.market/?service=mako-pollinateresearch-com)
[![Live](https://img.shields.io/badge/live-mako.pollinateresearch.com-brightgreen)](https://mako.pollinateresearch.com/.well-known/x402.json)

When a buyer agent is about to spend USDC against another x402 service, MAKO returns the right answer in one call:

| Endpoint | What it does | Price | Method | Path |
|---|---|---|---|---|
| **Route** ⭐ | Single-call composition: best service to invoke + signed receipt | $0.05 | POST | `/api/route` |
| Verifier | Should this *specific* call go through? | $0.25 | POST | `/api/agent-commerce/verify` |
| Pulse | Has this endpoint been behaving? | $0.02 | GET | `/api/pulse/score` |
| Pricing Index | Is this a fair price for this kind of work? | $0.02 | GET | `/api/pricing/index` |
| Reputation Score | Is the operator behind this wallet trustworthy? | $0.03 | GET | `/api/reputation/wallet` |

`POST /api/route` is the lead product: a single call that composes Verifier + Pulse + Pricing Index + Reputation Score, applies your constraints, and returns the best x402 service for the task plus an EIP-191 signed receipt. The four underlying pillars remain individually callable for any buyer agent that wants the raw signals.

Every paid call writes to the same ledger. Pulse, Pricing Index, Reputation Score, and Route all read from it — so each surface gets sharper as the others get used. The flywheel is already turning: the live Pulse scoreboard at [`mako.pollinateresearch.com/pulse`](https://mako.pollinateresearch.com/pulse) currently scores 142+ services across the agentic.market directory, and the Route catalog spans 28 services across 13 task buckets.

This repo is the open client SDK and protocol spec. The reference deployment runs on Base mainnet at `mako.pollinateresearch.com` — both this SDK and your own buyer agents call it the same way.

## Why this exists

x402 solves *how* agents pay: an HTTP `402 Payment Required` response carries the price, network, settlement asset, and recipient, and a follow-up request includes a signed EIP-3009 transfer authorization. Coinbase's facilitator settles it on-chain in one round trip.

x402 does not solve *whether agents should* pay. As autonomous agents start spending real USDC against real services, they need:

- **Pre-spend verification** that the target is callable, schema-valid, and settlement-ready. Catch the 30%+ of services on agentic.market that don't actually return a clean 402 to a no-payment probe — *before* you wire the call.
- **Endpoint reliability scoring** based on the population of all verifications, not the operator's self-reported uptime.
- **Market-rate pricing intelligence** so routing agents can pick the cheapest option that meets a spec, and budgeting agents can size their per-task allocations.
- **Per-wallet operator reputation** that aggregates reliability and settlement behavior across every endpoint a seller operates — structurally compatible with emerging ERC-8004 trustless-agent reputation semantics.

Closed-enterprise alternatives exist for parts of this (Prove Identity, Trulioo Know-Your-Agent). MAKO is the open, x402-native version, and it ships every primitive as its own callable, paid endpoint instead of bundling them behind a single API key.

## Quickstart (TypeScript)

```bash
npm install @pollinate/mako
```

```ts
import { MakoClient } from "@pollinate/mako";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const wallet = createWalletClient({
  account: privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`),
  chain: base,
  transport: http(),
});

const mako = new MakoClient({ wallet });

// Route — single-call recommendation ($0.05)
const route = await mako.route({
  task: "crypto-data",
  execution_mode: "recommend",
  buyer_wallet: wallet.account.address,
  constraints: {
    max_price_usdc: "0.20",
    min_reliability_score: 0.50,
    min_reputation_score: 0.50,
    preferred_jurisdictions: ["US", "EU"],
  },
});

if (route.verdict === "callable") {
  // route.recommendation.endpoint is the best x402 service to call
  // route.receipt is an EIP-191 signed proof, valid for 60 seconds
  // route.alternatives lists up to 3 ranked backups
  console.log("Calling:", route.recommendation.endpoint);
  // ... make the actual paid call to the recommended target
} else {
  // verdict ∈ "no_match" / "all_filtered" / "all_unreliable"
  // best_available_anyway shows the closest match if filters were too tight
  console.warn("No clean match:", route.reason);
}
```

If you want the raw signals instead of the composed answer, the four pillars are individually callable:

```ts
const verdict    = await mako.verify({ target_url: "https://target.example/api/foo", intended_task: "...", max_price_usdc: 0.10 });
const pulse      = await mako.pulse({ endpoint: "https://target.example/api/foo", window: "30d" });
const pricing    = await mako.pricingIndex({ category: "trading_signals", window: "30d" });
const reputation = await mako.reputation({ address: "0x...", window: "30d" });
```

For Python and MCP buyer agent examples, see [`examples/`](./examples).

## MAKO Route — single-call routing (the lead product)

`POST /api/route` — $0.05 USDC

Route is the composition apex. A buyer agent submits a canonical task name (e.g. `crypto-data`, `search`, `governance-brief`, `endpoint-verification`) plus optional constraints (max price, minimum reliability/reputation thresholds, preferred jurisdictions, prohibited operators). MAKO scores every catalog candidate against Pulse + Pricing Index + Reputation Score signals, applies the hard filters, and returns:

- the highest-scoring **recommendation** (endpoint + operator wallet + advertised price + reliability/reputation/fairness data)
- up to 3 **ranked alternatives** for fallback
- an **EIP-191 signed receipt** valid for 60 seconds, covering the recommendation under the buyer's exact constraints
- the **decision payload** so anyone can re-hash and verify the signature trustlessly

Composite score (default weights):

```
score = 0.40 × reliability + 0.30 × fairness + 0.20 × reputation + 0.10 × jurisdiction_bonus
```

Response shape:

```json
{
  "verdict": "callable",
  "task": "crypto-data",
  "recommendation": {
    "endpoint": "https://api.nansen.ai",
    "operator_wallet": "0x93053f1e...",
    "price_quoted_usdc": "0.10",
    "endpoint_reliability_score": 0.97,
    "operator_reputation_score": 0.94,
    "fairness_note": "8% below category median ($0.11)",
    "jurisdiction": "US",
    "kya_status": "unknown",
    "rank": 1
  },
  "alternatives": [
    { "endpoint": "https://public.zapper.xyz", "rank": 2, ... }
  ],
  "candidates_evaluated": 4,
  "candidates_passing_filters": 4,
  "receipt": {
    "checked_at": "2026-05-08T23:25:06Z",
    "message_hash": "0x...",
    "signature": "0x...",
    "signer": "0x12BBC7Cde00eB800588243A0B3B4E8E802673BFf",
    "signature_scheme": "eip191"
  },
  "decision_payload": { ... },
  "request_id": "rt_...",
  "issued_at": 1746719999,
  "receipt_expires_unix": 1746720059,
  "execution_result": null
}
```

`verdict` ∈ `callable` / `no_match` / `all_filtered` / `all_unreliable`. The `no_match` case (task not in catalog) returns a 422 and is not charged. The filter-failure verdicts return 200 + `best_available_anyway` (the closest near-miss, even if filtered) so buyers see what was nearly viable.

**v1 supports `execution_mode: "recommend"` only.** Execute and execute_with_fallback (where MAKO actually invokes the chosen service on the buyer's behalf) ship in v2.

Catalog (v1, hand-curated from current Pulse population): 28 services across 13 task buckets — `endpoint-verification`, `pulse-score`, `pricing-data`, `reputation-data`, `governance-brief`, `proposal-signal`, `crypto-data`, `market-data`, `search`, `image-generation`, `ai-inference`, `data-extraction`, `agent-storage`. Catalog expansion in v2 will auto-ingest from agentic.market.

Default reliability/reputation thresholds are intentionally relaxed (0.50) on launch because the verifier ledger is sparse. Routing volume densifies the ledger; the cold start IS the product.

## The four underlying pillars

### Verifier — pre-spend trust check

`POST /api/agent-commerce/verify` — $0.25 USDC

The headline route. A buyer agent describes what it's about to do and how much it's willing to spend; MAKO inspects the target's `/.well-known/x402.json`, validates route schemas, checks settlement readiness, and returns a machine-readable verdict.

Response shape:

```json
{
  "service": "_MAKO Agent Commerce Verifier",
  "verdict": "callable",
  "score": 86,
  "recommended_route": "GET /api/governance/proposal-signal",
  "price_usdc": 0.05,
  "schema_valid": true,
  "settlement_ready": true,
  "warnings": [],
  "call_plan": {
    "method": "GET",
    "url": "https://target.example/api/foo",
    "query": { "key": "value" }
  },
  "receipt": { "message_hash": "0x...", "signature_scheme": "sha256" }
}
```

`verdict` ∈ `callable` / `proceed_with_caution` / `not_callable`. `risk_mode: "strict"` raises the bar for what counts as callable. The `receipt` is hash-anchored and verifiable against the `record_id` returned in headers, queryable via `GET /api/agent-commerce/receipts/{record_id}`.

See [`examples/01-verify.ts`](./examples/01-verify.ts).

### Pulse — endpoint reliability

`GET /api/pulse/score` — $0.02 USDC

Pulse asks: "Is this specific URL behaving today?" It reads MAKO's verification ledger and returns callable rate, schema compliance rate, settlement success rate, latency p50/p95, and a 0–100 reliability score, over a configurable window (`7d`, `30d`, `90d`, `all`).

```json
{
  "endpoint": "https://target.example/api/foo",
  "reliability_score": 87,
  "status": "healthy",
  "window": "30d",
  "verifications": { "total": 42, "callable": 39, "not_callable": 2, "degraded": 1 },
  "rates": { "callable_rate": 0.929, "schema_compliance_rate": 1.0, "settlement_success_rate": 0.976 },
  "latency": { "p50_ms": 240, "p95_ms": 612 },
  "confidence": "high",
  "receipt": { "message_hash": "0x...", "signature_scheme": "sha256" }
}
```

A free public scoreboard rendering the latest Pulse reads across the agentic.market directory is available at [`mako.pollinateresearch.com/pulse`](https://mako.pollinateresearch.com/pulse), and as JSON at `/pulse.json`. Use the paid `/api/pulse/score` route when you want a fresh score for a specific URL on demand.

See [`examples/02-pulse-score.ts`](./examples/02-pulse-score.ts).

### Pricing Index — market-rate intelligence

`GET /api/pricing/index` — $0.02 USDC

Pricing Index asks: "For this kind of work, what's a fair price?" It groups every endpoint MAKO has verified into one of nine categories (`crypto_intelligence`, `trading_signals`, `governance`, `compliance`, `trust_layer`, `data_feeds`, `ai_inference`, `agent_infrastructure`, `other`) and returns the price distribution per category.

```json
{
  "category": "trading_signals",
  "window": "30d",
  "sample_size": { "verifications": 412, "unique_endpoints": 38 },
  "pricing_usdc": {
    "min": 0.005, "p25": 0.02, "median": 0.05,
    "mean": 0.084, "p75": 0.10, "p95": 0.25, "max": 0.50
  },
  "endpoint_count_by_price_band": {
    "free": 2, "0.001_to_0.01": 8, "0.01_to_0.05": 14,
    "0.05_to_0.10": 9, "0.10_to_0.25": 4, "above_0.25": 1
  },
  "confidence": "high",
  "computed_at": "2026-05-08T14:22:11Z",
  "receipt": { "message_hash": "0x...", "signature_scheme": "sha256" }
}
```

Distribution stats are computed over **unique endpoints** (latest observed price) so a high-volume endpoint can't skew the index. Omit `category` for a market-wide breakdown of medians, means, and p95s per category.

Built for routing agents picking the cheapest endpoint that meets a spec, budgeting agents managing per-task USDC allocations, and operators pricing their own services.

See [`examples/03-pricing-index.ts`](./examples/03-pricing-index.ts).

### Reputation Score — per-wallet operator trust

`GET /api/reputation/wallet` — $0.03 USDC

Reputation Score asks: "Is this seller trustworthy across everything they operate?" Where Pulse is per-endpoint, Reputation is per-wallet — it aggregates callable rate, schema compliance, settlement readiness, and recency across every x402 endpoint operated by a given seller wallet, and returns a 0–100 composite plus a tier (`trusted` / `reliable` / `developing` / `unreliable` / `unknown`).

```json
{
  "wallet": "0x4f3a2d1e9c7b6a5f8e3d2c1b0a9f8e7d6c5b4a3f",
  "chain": "eip155:8453",
  "window": "30d",
  "reputation_score": 87,
  "tier": "trusted",
  "confidence": "high",
  "sub_scores": {
    "callable_rate": 0.94,
    "schema_compliance_rate": 0.99,
    "settlement_success_rate": 0.91,
    "recency_factor": 1.0
  },
  "weights_used": {
    "callable_rate": 0.40,
    "schema_compliance_rate": 0.20,
    "settlement_success_rate": 0.30,
    "recency_factor": 0.10
  },
  "activity": {
    "total_verifications": 312,
    "unique_endpoints": 4,
    "categories_operated": ["crypto_intelligence", "trading_signals"],
    "first_seen_at": "2026-03-12T08:14:08Z",
    "last_verified_at": "2026-05-09T20:42:11Z",
    "days_active_in_window": 28
  },
  "warnings_summary": [{ "warning": "schema_drift", "count": 3 }],
  "receipt": { "message_hash": "0x...", "signature_scheme": "sha256" }
}
```

The schema is structurally compatible with emerging ERC-8004 trustless-agent reputation semantics: `score`, `tier`, `confidence`, sub-scores, and weights are all explicit, and the receipt is hash-anchored. Built for counterparty-evaluation agents, routing agents picking between equivalently-priced sellers, and escrow/dispute services.

See [`examples/04-reputation.ts`](./examples/04-reputation.ts).

## DAO Governance Ops (the original product line)

MAKO grew out of an earlier service line that's still shipping on the same domain:

- `POST /api/governance/weekly-brief` — $1.00 USDC. Generates a neutral DAO governance weekly brief from Snapshot and Tally proposal sources. Returns source-linked Markdown plus structured proposal metadata.
- `GET /api/governance/proposal-signal` — $0.05 USDC. Recent Snapshot proposals with deadlines, choices, scores, and urgency flags. Cheap enough to call frequently before deciding whether to buy a full weekly brief.

These are informational only — MAKO does not vote, sign transactions, or custody funds. See [`examples/05-governance-brief.ts`](./examples/05-governance-brief.ts).

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the four-pillar diagram, data flow, and a longer note on how the verification ledger feeds Pulse, Pricing Index, and Reputation Score from one source.

## Status

- **Network:** Base mainnet (`eip155:8453`)
- **Settlement asset:** USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Facilitator:** Coinbase CDP (with `x402.org/facilitator` fallback)
- **Listed on:** [agentic.market](https://agentic.market/?service=mako-pollinateresearch-com)
- **Live discovery:** [`/.well-known/x402.json`](https://mako.pollinateresearch.com/.well-known/x402.json)
- **Live Pulse scoreboard:** [`/pulse`](https://mako.pollinateresearch.com/pulse) — currently scoring 142+ of 659 directory services
- **Route catalog:** 28 services across 13 task buckets, hand-curated from current Pulse population
- **Receipt signer:** `0x12BBC7Cde00eB800588243A0B3B4E8E802673BFf` (EIP-191)
- **Source:** this repo

## Self-host

To run your own MAKO facilitator instead of calling the reference deployment, you'll need:

- A Base mainnet wallet to receive payments
- An EIP-3009-compatible facilitator (Coinbase CDP recommended, x402.org/facilitator works as a fallback)
- A FastAPI-compatible host (Render, Fly, Railway, Heroku — all work; the reference deployment uses Heroku)

Production code lives in the operator's private repo and is not redistributed here. This SDK calls into any compatible MAKO deployment via the same x402 protocol, so a self-hosted endpoint is a drop-in replacement: pass `baseUrl` to the `MakoClient` constructor.

```ts
const mako = new MakoClient({
  wallet,
  baseUrl: "https://my-mako.example.com",
});
```

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Issues and PRs welcome — particularly:

- Buyer-side agent integrations (LangChain, AutoGen, CrewAI, etc.)
- Additional language SDKs (Python, Go, Rust)
- MCP server wrappers exposing MAKO pillars as agent tools
- Worked examples for specific verticals (DEX trading, governance, compliance)

## Security

See [`SECURITY.md`](./SECURITY.md). Report vulnerabilities to chrisdover@gmail.com (PGP available on request) — please do not file public issues for security-sensitive findings.

## Operator

Built and operated by [Pollinate Research](https://pollinateresearch.com).

Contact: chrisdover@gmail.com · `chrisdmacro.base.eth` · [`github.com/ChrisDover`](https://github.com/ChrisDover)

## License

MIT — see [`LICENSE`](./LICENSE).
