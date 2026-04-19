import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";
import { spawnSync } from "child_process";

const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

function runReleaseTests() {
  if (process.env.SKIP_RELEASE_TESTS === "1") {
    console.log("SKIP_RELEASE_TESTS=1 → skipping vitest pre-build check");
    return;
  }
  console.log("running vitest pre-build check (set SKIP_RELEASE_TESTS=1 to bypass)...");
  const result = spawnSync(
    "node",
    ["node_modules/vitest/vitest.mjs", "run"],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.error(
      "vitest pre-build check failed — refusing to build a release artifact.",
    );
    process.exit(result.status ?? 1);
  }
}

async function buildAll() {
  runReleaseTests();

  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
