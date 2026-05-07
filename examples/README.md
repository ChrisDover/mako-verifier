# MAKO examples

Each example is a single-file, self-contained TypeScript script that exercises one MAKO pillar end-to-end. Run any of them with `npx tsx examples/<file>.ts` after setting `AGENT_PRIVATE_KEY` in your `.env`.

| File | Pillar | Cost | What it shows |
|---|---|---|---|
| [`01-verify.ts`](./01-verify.ts) | Verifier | $0.25 | Pre-spend trust check on an arbitrary x402 service URL. Returns verdict + score + call plan + receipt. |
| [`02-pulse-score.ts`](./02-pulse-score.ts) | Pulse | $0.02 | Endpoint reliability score over a 30-day window. Use before any high-stakes call. |
| [`03-pricing-index.ts`](./03-pricing-index.ts) | Pricing Index | $0.02 | Per-category price distribution + market-wide median by category. |
| [`04-reputation.ts`](./04-reputation.ts) | Reputation Score | $0.03 | Per-wallet operator trust score with sub-score breakdown. ERC-8004 compatible. |
| [`05-governance-brief.ts`](./05-governance-brief.ts) | DAO Governance Ops | $1.00 | Source-linked weekly brief from Snapshot/Tally. The original MAKO product line. |

## Setup

```bash
cp ../.env.example .env
# Edit .env and set AGENT_PRIVATE_KEY=0x...
npm install
```

You'll need a Base mainnet wallet funded with at least $2 USDC to run all five examples (the Verifier is the most expensive at $0.25; the Governance Brief is one-shot at $1.00).

## Pattern: pre-screen with Pulse, deep-check with Verifier

Most production buyer agents won't call the Verifier on every transaction — that's $0.25 per call. The cheap pattern is:

```ts
const pulse = await mako.pulse({ endpoint: target, window: "30d" });
if (pulse.reliability_score === null || pulse.reliability_score < 70 || pulse.confidence === "low") {
  // Pulse signaled there's a reason to look. Spend the $0.25.
  const verdict = await mako.verify({ target_url: target, intended_task, max_price_usdc });
  if (verdict.verdict !== "callable") return;
}
// Else, proceed with the actual paid call to `target`.
```

In steady state this costs $0.02 per call. When something starts breaking, it auto-escalates to a $0.27 deep check. See [`ARCHITECTURE.md`](../ARCHITECTURE.md) for more composition patterns.

## Coming soon

- `python/verify.py` — Python equivalent of `01-verify.ts`
- `mcp/mako-mcp-server.ts` — MCP server exposing all four pillars as agent tools
- `langchain/` — LangChain tool wrappers
- `dex-trading/` — Worked end-to-end DEX trading agent that uses Pulse + Pricing Index + Reputation before placing each order
