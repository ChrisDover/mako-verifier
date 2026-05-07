/**
 * Pillar 1 — Verifier ($0.25 USDC)
 *
 * Pre-spend trust check. The buyer agent describes what it wants to do
 * and how much it's willing to spend; MAKO returns a verdict, score,
 * and pre-built call plan.
 *
 * Run: AGENT_PRIVATE_KEY=0x... npx tsx examples/01-verify.ts
 */

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { MakoClient } from "../src/index.js";

const TARGET_TO_VERIFY =
  process.env.TARGET_URL ??
  "https://mako.pollinateresearch.com"; // Verifier verifying itself, by default

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

  const mako = new MakoClient({
    wallet,
    baseUrl: process.env.MAKO_BASE_URL,
  });

  console.log(`Asking MAKO to verify: ${TARGET_TO_VERIFY}`);
  console.log("Cost: $0.25 USDC on Base.\n");

  const verdict = await mako.verify({
    target_url: TARGET_TO_VERIFY,
    intended_task: "Find and call a paid x402 governance signal endpoint",
    max_price_usdc: 0.10,
    risk_mode: "strict",
  });

  console.log("Verdict:", verdict.verdict);
  console.log("Score:  ", verdict.score, "/ 100");
  console.log("Schema valid:        ", verdict.schema_valid);
  console.log("Settlement ready:    ", verdict.settlement_ready);
  console.log("Recommended route:   ", verdict.recommended_route);
  console.log("Recommended price:   ", verdict.price_usdc, "USDC");
  if (verdict.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const w of verdict.warnings) console.log(" -", w);
  }
  console.log("\nCall plan:");
  console.log(JSON.stringify(verdict.call_plan, null, 2));
  console.log("\nReceipt hash:", verdict.receipt.message_hash);

  // Optional: verify the receipt matches the body
  const ok = await mako.verifyReceipt(verdict);
  console.log("Receipt verified:", ok);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
