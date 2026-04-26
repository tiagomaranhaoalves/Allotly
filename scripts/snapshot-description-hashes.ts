#!/usr/bin/env tsx
/**
 * Re-snapshot the SHA-256 of every registered MCP tool description and write
 * them to server/lib/mcp/tools/description-hashes.json. Run this whenever you
 * intentionally change a tool description (i.e. you've reviewed the new copy
 * for prompt-injection / tool-spoofing risk and want to ship it).
 *
 *   $ npx tsx scripts/snapshot-description-hashes.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { computeDescriptionHashes, getPinnedHashesFilePath } from "../server/lib/mcp/tools";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const computed = computeDescriptionHashes();
const target = getPinnedHashesFilePath();

const sorted: Record<string, string> = {};
for (const k of Object.keys(computed).sort()) sorted[k] = computed[k];

const payload = {
  $note: "Auto-generated snapshot of SHA-256(tool.description) for every registered MCP tool. Regenerate with `npx tsx scripts/snapshot-description-hashes.ts` after intentionally editing a description; commit the diff. Drift at server startup is a hard error in production.",
  hashes: sorted,
};

fs.writeFileSync(target, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`[snapshot] wrote ${Object.keys(sorted).length} hashes -> ${path.relative(process.cwd(), target)}`);
process.exit(0);
