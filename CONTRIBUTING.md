# Contributing to MAKO

Thanks for your interest. MAKO is a small, opinionated trust layer for agent commerce, and we want it to stay that way — but contributions are welcome in a few specific places.

## What we want

- **Buyer-side integrations.** Worked examples that wire MAKO into LangChain, AutoGen, CrewAI, BAML, Vercel AI SDK, or anything else agents are being built with today.
- **Additional language SDKs.** Python, Go, and Rust are all welcome. The contract is the live `/.well-known/x402.json` shape — match it and you're done.
- **MCP wrappers.** A Model Context Protocol server that exposes MAKO's four pillars as tools for Claude / GPT / Gemini agents.
- **Vertical examples.** End-to-end demos for DEX trading, governance, compliance, data feeds, etc. These help potential users see whether MAKO fits their problem before they integrate.
- **Bug reports** with reproducible steps against the live deployment, especially around x402 protocol edge cases.
- **Documentation improvements.** README clarifications, ARCHITECTURE expansions, more accurate diagrams.

## What we don't want

- **Verification heuristic changes** in this repo. The verification logic lives in the operator's private repo. If you have ideas for better heuristics, open an issue describing them and we'll evaluate.
- **Caching or proxying layers** that hide the per-pillar pricing model from buyer agents. The whole point is honest, per-call pricing.
- **Forks that white-label the reference deployment** without operating their own infrastructure. You're free to do this under MIT, but we won't merge changes that make it easier.

## Process

1. Open an issue describing what you want to do, before opening a PR. We're happy to give a thumbs-up early so you don't waste time on a direction we'd reject.
2. Fork, branch from `main`, and open a PR.
3. CI must pass. Tests live in `examples/` (smoke tests against the live deployment) and `src/__tests__/` (unit tests for the SDK).
4. One reviewer approval is enough for non-protocol changes. Protocol-shape changes (touching `/.well-known/x402.json` schema or pillar response shapes) require two.

## Code style

- TypeScript with `strict: true`. No `any` outside of x402 protocol-edge code.
- ESLint + Prettier; CI enforces both.
- Examples should be short, runnable, and use real prices — never dummy values.

## Questions

chrisdover@gmail.com or `chrisdmacro.base.eth`. Issues are also fine for anything that benefits from public discussion.
