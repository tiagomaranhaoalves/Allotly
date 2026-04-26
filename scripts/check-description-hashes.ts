#!/usr/bin/env tsx
/**
 * CI / pre-commit gate for MCP tool description drift.
 *
 * Exits 0 if every registered tool's SHA-256(description) matches the pinned
 * snapshot in server/lib/mcp/tools/description-hashes.json. Exits 1 with a
 * readable diff if anything has drifted or any tool is missing a pin.
 *
 * Wired into `npm run check` so CI surfaces drift before review. Local dev
 * also surfaces it because pinDescriptionsAtStartup() throws unconditionally,
 * but this script lets a contributor verify before booting the server.
 *
 * Workflow when you intentionally change a tool description:
 *   1) Edit the tool description.
 *   2) `npx tsx scripts/snapshot-description-hashes.ts`
 *   3) `git diff server/lib/mcp/tools/description-hashes.json` (sanity check)
 *   4) Commit both the description change and the hash diff in one PR.
 */
import {
  computeDescriptionHashes,
  PINNED_DESCRIPTION_HASHES,
  getPinnedHashesFilePath,
} from "../server/lib/mcp/tools";

const computed = computeDescriptionHashes();
const pinnedFilePath = getPinnedHashesFilePath();

const missing: string[] = [];
const drifted: Array<{ tool: string; pinned: string; actual: string }> = [];
const stale: string[] = [];

for (const [name, actual] of Object.entries(computed)) {
  const pinned = PINNED_DESCRIPTION_HASHES[name];
  if (!pinned) {
    missing.push(name);
    continue;
  }
  if (pinned !== actual) {
    drifted.push({ tool: name, pinned, actual });
  }
}

for (const name of Object.keys(PINNED_DESCRIPTION_HASHES)) {
  if (!(name in computed)) stale.push(name);
}

if (missing.length === 0 && drifted.length === 0 && stale.length === 0) {
  console.log(
    `[check-description-hashes] OK — ${Object.keys(computed).length} tools match ${pinnedFilePath}`,
  );
  process.exit(0);
}

console.error("[check-description-hashes] DRIFT DETECTED");
console.error(`Pin file: ${pinnedFilePath}\n`);

if (missing.length > 0) {
  console.error(`Missing pins for ${missing.length} tool(s):`);
  for (const n of missing) console.error(`  - ${n}`);
  console.error("");
}

if (drifted.length > 0) {
  console.error(`Drift in ${drifted.length} tool description(s):`);
  for (const d of drifted) {
    console.error(
      `  - ${d.tool}\n      pinned=${d.pinned}\n      actual=${d.actual}`,
    );
  }
  console.error("");
}

if (stale.length > 0) {
  console.error(`Stale pins (no matching tool) for ${stale.length} entry(ies):`);
  for (const n of stale) console.error(`  - ${n}`);
  console.error("");
}

console.error(
  "Fix: review the new copy for prompt-injection / tool-spoofing risk, then run\n" +
    "  $ npx tsx scripts/snapshot-description-hashes.ts\n" +
    "and commit the regenerated description-hashes.json in the same PR.",
);
process.exit(1);
