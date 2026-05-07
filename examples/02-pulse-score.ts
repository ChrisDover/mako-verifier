/**
 * Pillar 2 — Pulse ($0.02 USDC)
 *
 * Per-endpoint reliability score derived from MAKO's verification
 * history. Cheap enough to call before every transaction.
 *
 * Run: AGENT_PRIVATE_KEY=0x... npx tsx examples/02-pulse-score.ts
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { MakoClient } from "../src/index.js";

const TARGET_TO_SCORE =
  process.env.TARGET_URL ??
  "https://mako.pollinateresearch.com/api/agent-commerce/verify";

async function main() {
  const pk = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
  if (!pk) {
    console.error("Set AGENT_PRIVATE_KEY=0x... in .env first.");
    process.exit(1);
  }

  const wallet = createWalletClient({
    account: privateKeyToAccount(pk),
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });

  const mako = new MakoClient({ wallet, baseUrl: process.env.MAKO_BASE_URL });

  console.log(`Pulse score for: ${TARGET_TO_SCORE}`);
  console.log("Cost: $0.02 USDC.\n");

  const pulse = await mako.pulse({ endpoint: TARGET_TO_SCORE, window: "30d" });

  console.log("Reliability score:", pulse.reliability_score, "/ 100");
  console.log("Status:           ", pulse.status);
  console.log("Confidence:       ", pulse.confidence);
  console.log("Window:           ", pulse.window);
  console.log("\nVerifications in window:");
  console.log("  Total:        ", pulse.verifications.total);
  console.log("  Callable:     ", pulse.verifications.callable);
  console.log("  Not callable: ", pulse.verifications.not_callable);
  console.log("  Degraded:     ", pulse.verifications.degraded);
  console.log("\nRates:");
  console.log("  Callable:           ", pulse.rates.callable_rate);
  console.log("  Schema compliance:  ", pulse.rates.schema_compliance_rate);
  console.log("  Settlement success: ", pulse.rates.settlement_success_rate);
  console.log("\nLatency:");
  console.log("  p50:", pulse.latency.p50_ms, "ms");
  console.log("  p95:", pulse.latency.p95_ms, "ms");
  if (pulse.warnings_summary.length > 0) {
    console.log("\nRecurring warnings:");
    for (const w of pulse.warnings_summary)
      console.log(" -", w.warning, `(seen ${w.count}x)`);
  }
  console.log("\nReceipt hash:", pulse.receipt.message_hash);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
