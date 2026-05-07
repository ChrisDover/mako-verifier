/**
 * Governance Ops Desk — Weekly Brief ($1.00 USDC)
 *
 * Generates a neutral DAO governance weekly brief from Snapshot/Tally
 * proposal data. Returns Markdown plus structured proposal metadata.
 * The cheaper Proposal Signal endpoint ($0.05) is more useful for
 * frequent agent monitoring; this one is the deliverable a human
 * (or an agent acting on behalf of a treasury manager) actually reads.
 *
 * Run: AGENT_PRIVATE_KEY=0x... npx tsx examples/05-governance-brief.ts
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

  console.log("Generating governance weekly brief for arbitrumfoundation.eth");
  console.log("Cost: $1.00 USDC.\n");

  const brief = await mako.governanceWeeklyBrief({
    client_name: "Example Treasury Watch Agent",
    snapshot_spaces: ["arbitrumfoundation.eth"],
    snapshot_states: ["active", "pending"],
    snapshot_order_direction: "desc",
    limit: 5,
    max_summaries: 3,
    skip_model: false, // set true to skip local model inference and use deterministic excerpts only
  });

  console.log("Generated at:    ", brief.generated_at);
  console.log("Proposals found: ", brief.proposal_count);
  console.log("Summaries built: ", brief.summaries_count);
  console.log("\n--- Brief ---\n");
  console.log(brief.brief_markdown);
  console.log("\n--- Structured proposal metadata ---\n");
  for (const p of brief.proposal_metadata) {
    console.log(`- [${p.state}] ${p.title}`);
    console.log(`  ${p.url}`);
  }
  console.log("\nReceipt hash:", brief.receipt.message_hash);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
