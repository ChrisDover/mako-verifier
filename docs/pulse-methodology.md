# Pulse methodology

How MAKO computes the Pulse reliability score for a single endpoint.

## Inputs

For each endpoint, the verification ledger holds an append-only log of records:

```ts
interface VerificationRecord {
  endpoint: string;            // canonicalized URL
  observed_at: string;         // ISO-8601 timestamp
  callable: boolean;           // 402 returned with valid payment-required header?
  schema_compliant: boolean;   // response body matches the declared output schema?
  settlement_succeeded: boolean | null; // null if settlement wasn't attempted
  latency_ms: number;          // round-trip time for the probe
  warnings: string[];          // structured warning codes
  payment_amount_micro: string; // what the endpoint charged
}
```

A record is written every time a buyer agent (or MAKO's own scoreboard refresh job) calls the Verifier or directly probes an endpoint.

## Window selection

Pulse takes a `window` parameter — `7d`, `30d`, `90d`, or `all`. The scoring functions filter records to `observed_at >= now() - window`.

Pick a shorter window for high-velocity decisions (a 7-day window catches recent regressions faster). Pick a longer window for endpoints with low call volume where 30 days might still only have a handful of observations.

## The four sub-scores

```
callable_rate           = sum(1 for r in records if r.callable) / len(records)
schema_compliance_rate  = sum(1 for r in records if r.schema_compliant) / len(records)
settlement_success_rate = sum(1 for r in records if r.settlement_succeeded is True)
                          / sum(1 for r in records if r.settlement_succeeded is not None)
latency_factor          = piecewise:
                            1.0   if p50_ms <= 200
                            0.7   if 200 < p50_ms <= 500
                            0.4   if 500 < p50_ms <= 1000
                            0.1   if p50_ms > 1000
```

Latency uses p50 rather than mean to be robust to occasional spikes.

## The composite score

```
reliability_score = round(100 * (
    0.40 * callable_rate
  + 0.25 * schema_compliance_rate
  + 0.20 * settlement_success_rate
  + 0.15 * latency_factor
))
```

The weights reflect a buyer agent's priorities:

- **Callable rate is most important** because if a service won't return a valid 402, the buyer can't even pay it. This dominates the score.
- **Schema compliance** matters because a service that returns a 200 with the wrong shape forces the buyer to write defensive parsing code per-target.
- **Settlement success** matters because a service that returns 200 but where the on-chain settlement actually failed leaves the buyer holding signed authorizations they can't retract.
- **Latency** matters but is the smallest weight because most buyer agents will tolerate a slow service if it's reliable.

If you disagree with these weights, you can compute your own composite from the sub-scores returned in the response.

## Status thresholds

```
status =
  "healthy"   if reliability_score >= 80
  "degraded"  if 50 <= reliability_score < 80
  "down"      if reliability_score < 50
  "unknown"   if no records in the window
```

## Confidence

Confidence is independent of the score — it reflects how much you can trust the score itself:

```
confidence =
  "high"    if total_records >= 30 and days_active >= 14
  "medium"  if total_records >= 10 and days_active >= 7
  "low"     if total_records >= 3
  "none"    otherwise
```

A `score: 95, confidence: "low"` from 4 observations is materially less actionable than `score: 87, confidence: "high"` from 312 observations. Buyer agents should weight scores by confidence when making routing decisions.

## What Pulse doesn't measure

- **Output quality.** Pulse can tell you a service returns a 200 with a schema-valid body. It can't tell you the body's content is correct. (For some categories — e.g., price feeds — operators can publish ground-truth verifiers; this is on the MAKO roadmap as a Phase 5 add-on.)
- **Operator intent.** A service that's reliably returning correct results today might be operated by someone planning to rug. Pulse is a reliability signal, not a fraud signal. Use Reputation Score for the operator-level view, and use Verifier with `risk_mode: "strict"` for the most aggressive pre-spend check.
- **Long-tail availability.** Pulse averages over the window; a service that's down for 4 hours every Tuesday will score lower but won't be flagged as having a periodic outage. Buyers who care about specific time windows should call Pulse with a shorter window aligned to their use period.

## How to improve a Pulse score

Operators sometimes ask. The honest answer:

1. Make sure your service returns a valid `payment-required` header on every 402. The most common failure mode is returning a 402 with no header (or a malformed one) when your facilitator backend hiccups.
2. Make sure the response body you return on 200 actually matches the schema you declared in `/.well-known/x402.json`. Schema drift is the second-most-common warning we record.
3. Settle promptly. Slow-settling endpoints tank the settlement_success_rate even when the call itself was fine.
4. Keep p50 latency under 200ms. Above 500ms you start losing significant ground.

You can monitor your own endpoint without paying by reading `/pulse.json`, the public scoreboard JSON.
