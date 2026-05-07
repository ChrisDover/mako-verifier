/**
 * Pillar 4 — Reputation Score ($0.03 USDC)
 *
 * Per-wallet operator trust. Aggregates reliability and settlement
 * behavior across every x402 endpoint operated by a seller wallet,
 * and returns a tier (trusted / reliable / developing / unreliable / unknown)
 * plus a 0-100 composite score. Structurally compatible with ERC-8004.
 *
 * Run: AGENT_PRIVATE_KEY=0x... npx tsx examples/04-reputation.ts
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { MakoClient } from "../src/index.js";

const SELLER_TO_LOOKUP =
  process.env.SELLER_WALLET ??
  "0x6e4DfBe49858E9Cb93162352D75DBD1E409A7737"; // MAKO's own payTo, by default

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

  console.log(`Reputation lookup for seller: ${SELLER_TO_LOOKUP}`);
  console.log("Cost: $0.03 USDC.\n");

  const rep = await mako.reputation({
    address: SELLER_TO_LOOKUP,
    window: "30d",
  });

  console.log("Composite score:", rep.reputation_score, "/ 100");
  console.log("Tier:           ", rep.tier);
  console.log("Confidence:     ", rep.confidence);
  console.log("Window:         ", rep.window);

  if (rep.sub_scores && rep.weights_used) {
    console.log("\nSub-scores (weight × value):");
    for (const k of Object.keys(rep.sub_scores) as Array<keyof typeof rep.sub_scores>) {
      const w = rep.weights_used[k];
      const v = rep.sub_scores[k];
      console.log(
        `  ${k.padEnd(28)} weight=${w.toFixed(2)}  value=${v.toFixed(3)}  contribution=${(w * v * 100).toFixed(1)}`
      );
    }
  }

  console.log("\nActivity:");
  console.log("  Total verifications:  ", rep.activity.total_verifications);
  console.log("  Unique endpoints:     ", rep.activity.unique_endpoints);
  console.log("  Categories operated:  ", rep.activity.categories_operated.join(", ") || "none");
  console.log("  First seen:           ", rep.activity.first_seen_at);
  console.log("  Last verified:        ", rep.activity.last_verified_at);
  console.log("  Days active in window:", rep.activity.days_active_in_window);

  if (rep.warnings_summary.length > 0) {
    console.log("\nRecurring warnings:");
    for (const w of rep.warnings_summary) {
      console.log(" -", w.warning, `(seen ${w.count}x)`);
    }
  }

  console.log("\nReceipt hash:", rep.receipt.message_hash);
  console.log("\n(Reputation scores are structurally compatible with ERC-8004.)");
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
