/**
 * Pillar 3 — Pricing Index ($0.02 USDC)
 *
 * Market-rate pricing distribution per category. Use it to:
 *   - Decide what to charge for your own service.
 *   - Pick the cheapest endpoint that meets a spec.
 *   - Size per-task USDC budgets.
 *
 * Run: AGENT_PRIVATE_KEY=0x... npx tsx examples/03-pricing-index.ts
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { MakoClient } from "../src/index.js";

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

  // Per-category lookup
  console.log("Pricing distribution for trading_signals (30d window)");
  console.log("Cost: $0.02 USDC.\n");

  const tradingSignals = await mako.pricingIndex({
    category: "trading_signals",
    window: "30d",
  });

  console.log("Sample size:");
  console.log("  Verifications:    ", tradingSignals.sample_size.verifications);
  console.log("  Unique endpoints: ", tradingSignals.sample_size.unique_endpoints);
  console.log("\nPrice distribution (USDC):");
  if (tradingSignals.pricing_usdc) {
    const p = tradingSignals.pricing_usdc;
    console.log(`  min:    $${p.min.toFixed(4)}`);
    console.log(`  p25:    $${p.p25.toFixed(4)}`);
    console.log(`  median: $${p.median.toFixed(4)}`);
    console.log(`  mean:   $${p.mean.toFixed(4)}`);
    console.log(`  p75:    $${p.p75.toFixed(4)}`);
    console.log(`  p95:    $${p.p95.toFixed(4)}`);
    console.log(`  max:    $${p.max.toFixed(4)}`);
  }
  console.log("\nEndpoint count by price band:");
  if (tradingSignals.endpoint_count_by_price_band) {
    for (const [band, count] of Object.entries(
      tradingSignals.endpoint_count_by_price_band
    )) {
      console.log(`  ${band.padEnd(20)} ${count}`);
    }
  }
  console.log("\nFreshness:", tradingSignals.freshness_hours, "hours");
  console.log("Confidence:", tradingSignals.confidence);

  // Also do a market-wide breakdown (no category)
  console.log("\n---\n");
  console.log("Market-wide breakdown (omit category):");
  const marketWide = await mako.pricingIndex({ window: "30d" });
  if (marketWide.by_category) {
    console.log("Median price by category:");
    for (const [cat, dist] of Object.entries(marketWide.by_category)) {
      if (dist) console.log(`  ${cat.padEnd(25)} $${dist.median.toFixed(4)}`);
    }
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
