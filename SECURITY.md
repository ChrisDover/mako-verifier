# Security policy

## Supported versions

This SDK is published from `main`. Security fixes ship as patch releases against the latest minor. Older minors are not backported.

## Reporting a vulnerability

Email **chrisdover@gmail.com** with `[MAKO security]` in the subject. PGP key available on request.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce, ideally with a curl command or minimal script
- Whether you've already disclosed to anyone else
- How you'd like to be credited (or whether you'd prefer to remain anonymous)

We'll acknowledge receipt within 48 hours and aim to provide a substantive response within 5 business days.

## What's in scope

- This SDK (`@pollinate/mako` on npm and the source in this repo)
- The reference deployment at `mako.pollinateresearch.com`, including:
  - x402 payment header construction or verification flaws
  - Receipt forgery or hash-anchoring weaknesses
  - Wallet authorization or replay attacks
  - Information disclosure via `/.well-known/x402.json`, `/openapi.json`, `/docs`, or any paid route
  - Improper handling of `eip155:8453` settlement asset (USDC at `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)

## What's out of scope

- **Reputation Score values themselves.** The score is informational; if you disagree with how a particular wallet is scored, that's a methodology discussion, not a security report.
- **Pulse scores for endpoints you don't operate.** Same.
- **Pricing Index distributions.** Same.
- Denial-of-service from unauthenticated probing. The service is rate-limited at the facilitator and runtime layers; please don't try to DoS it as a "test."
- Issues in third-party x402 facilitators (Coinbase CDP, x402.org) — report those upstream.
- Issues in the buyer agent's own wallet handling — that's the integrator's responsibility.

## Disclosure

We follow coordinated disclosure: private fix → patch release → public advisory. Typical timeline is 14–30 days from report to advisory, faster for critical issues. Researchers who follow this process are credited in the advisory.
