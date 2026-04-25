#!/usr/bin/env node
import { chmodSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "..", "dist", "index.js");

if (!existsSync(target)) {
  console.error(`[postbuild] dist/index.js not found at ${target}`);
  process.exit(1);
}

if (process.platform === "win32") {
  process.exit(0);
}

try {
  chmodSync(target, 0o755);
} catch (err) {
  console.error(
    `[postbuild] failed to chmod ${target}: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}
