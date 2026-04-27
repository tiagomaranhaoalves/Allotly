import crypto from "crypto";
import path from "path";
import { listTools } from "./registry";

import "./consumption/list-available-models";
import "./consumption/chat";
import "./consumption/compare-models";
import "./consumption/recommend-model";

import "./recipient/voucher-info";
import "./recipient/my-budget";
import "./recipient/my-status";
import "./recipient/my-recent-usage";
import "./recipient/diagnose";
import "./recipient/quickstart";
import "./recipient/redeem-voucher";
import "./recipient/redeem-and-chat";
import "./recipient/request-topup";

import pinnedFile from "./description-hashes.json";

export interface PinnedHashesFile {
  $note?: string;
  hashes: Record<string, string>;
}

export const PINNED_DESCRIPTION_HASHES: Record<string, string> = {
  ...((pinnedFile as PinnedHashesFile).hashes || {}),
};

export function computeDescriptionHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of listTools()) {
    out[t.name] = crypto.createHash("sha256").update(t.description).digest("hex");
  }
  return out;
}

/**
 * At server startup, compare every registered tool's description against the
 * snapshot in `description-hashes.json`. Drift is a hard error EVERYWHERE
 * (dev, test, prod) so unreviewed copy changes never reach a PR. The locked
 * workflow: edit a tool description -> run `npx tsx scripts/snapshot-description-hashes.ts`
 * -> commit the regenerated JSON in the same PR. The "warn-and-self-heal"
 * path was removed because it defeated the point: drift in dev silently
 * propagated to PRs without the hash file being intentionally bumped.
 *
 * The same comparison logic backs `scripts/check-description-hashes.ts`
 * (wired into `npm run check`) so CI catches drift before review.
 */
export function pinDescriptionsAtStartup(): void {
  const computed = computeDescriptionHashes();
  const drifted: Array<{ tool: string; pinned: string; actual: string }> = [];
  const missingPin: string[] = [];

  for (const [name, actual] of Object.entries(computed)) {
    const pinned = PINNED_DESCRIPTION_HASHES[name];
    if (!pinned) {
      missingPin.push(name);
      continue;
    }
    if (pinned !== actual) {
      drifted.push({ tool: name, pinned, actual });
    }
  }

  if (missingPin.length > 0) {
    throw new Error(
      `[mcp] description-hashes.json is missing entries for: ${missingPin.join(", ")}. ` +
        `Run \`npx tsx scripts/snapshot-description-hashes.ts\` to regenerate, then commit the diff.`,
    );
  }

  if (drifted.length > 0) {
    const summary = drifted
      .map((d) => `${d.tool}: pinned=${d.pinned.slice(0, 8)} actual=${d.actual.slice(0, 8)}`)
      .join("; ");
    throw new Error(
      `[mcp] tool description drift detected vs description-hashes.json: ${summary}. ` +
        `Re-snapshot with \`npx tsx scripts/snapshot-description-hashes.ts\` after reviewing the new copy, then commit.`,
    );
  }
}

export function getPinnedHashesFilePath(): string {
  return path.resolve(process.cwd(), "server/lib/mcp/tools/description-hashes.json");
}

export { listTools, getTool } from "./registry";
