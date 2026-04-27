import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Hotfix #3 regression: every Redis helper MUST throw when the strict-mode
// gate is on but the underlying client is not available. Today's silent
// degrade-to-memory behaviour is what corrupted OAuth pending state across
// replicas — this guarantee is what every Redis caller (OAuth, rate limits,
// budget ledger, API-key cache, etc.) relies on in production.
//
// Why a unit test, not a real boot test:
//   The shared `server/lib/redis.ts` module-level `initPromise` is created
//   once at import time, gated by the existing `isTest` detection
//   (NODE_ENV/VITEST/VITEST_WORKER_ID). Trying to flip NODE_ENV=production
//   and then race a real ioredis connection inside vitest pulls in 6s+
//   of retry backoff per command and pollutes other tests. Using the
//   deterministic "REDIS_URL missing in production" path proves the same
//   user-facing guarantee — that the strict-mode gate refuses to silently
//   succeed against the in-memory store — without any network I/O.

describe("redis fail-loud (hotfix #3)", () => {
  let originalNodeEnv: string | undefined;
  let originalRedisUrl: string | undefined;
  let originalVitest: string | undefined;
  let originalVitestWorkerId: string | undefined;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    originalRedisUrl = process.env.REDIS_URL;
    originalVitest = process.env.VITEST;
    originalVitestWorkerId = process.env.VITEST_WORKER_ID;
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    if (originalVitest === undefined) delete process.env.VITEST;
    else process.env.VITEST = originalVitest;
    if (originalVitestWorkerId === undefined) delete process.env.VITEST_WORKER_ID;
    else process.env.VITEST_WORKER_ID = originalVitestWorkerId;
  });

  it("waitForRedisReady() rejects when REDIS_URL is missing in production", async () => {
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    process.env.NODE_ENV = "production";
    delete process.env.REDIS_URL;

    vi.resetModules();
    const mod = await import("../../server/lib/redis");

    await expect(mod.waitForRedisReady()).rejects.toThrow(/REDIS_URL is required/i);
  });

  it("every helper throws in production when redis is unavailable (no silent memory fallback)", async () => {
    // REDIS_URL deliberately unset in production: initRedis() rejects
    // before constructing the ioredis client, so the module-level `redis`
    // variable stays null. This is the exact state that today's silent
    // degrade-to-memory bug would camouflage with success — the strict-mode
    // helpers must throw via requireRedisOrThrow() instead.
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    process.env.NODE_ENV = "production";
    delete process.env.REDIS_URL;

    vi.resetModules();
    const mod = await import("../../server/lib/redis");

    // Swallow the boot-time rejection so it doesn't surface as an
    // unhandled-rejection warning in the test runner.
    mod.waitForRedisReady().catch(() => {});

    // Every helper individually — a future contributor who adds a new
    // helper without the strict-mode guard sees a clear test failure here.
    await expect(mod.redisGet("k")).rejects.toThrow(/required in production/i);
    await expect(mod.redisSet("k", "v")).rejects.toThrow(/required in production/i);
    await expect(mod.redisSet("k", "v", 60)).rejects.toThrow(/required in production/i);
    await expect(mod.redisDel("k")).rejects.toThrow(/required in production/i);
    await expect(mod.redisGetDel("k")).rejects.toThrow(/required in production/i);
    await expect(mod.redisExpire("k", 60)).rejects.toThrow(/required in production/i);
    await expect(mod.redisIncr("k")).rejects.toThrow(/required in production/i);
    await expect(mod.redisDecr("k")).rejects.toThrow(/required in production/i);
    await expect(mod.redisIncrBy("k", 2)).rejects.toThrow(/required in production/i);
    await expect(mod.redisDecrBy("k", 2)).rejects.toThrow(/required in production/i);
    await expect(mod.redisKeys("*")).rejects.toThrow(/required in production/i);
    await expect(mod.redisExists("k")).rejects.toThrow(/required in production/i);
  });

  it("dev with no REDIS_URL still uses the in-memory fallback (no behaviour change for local dev)", async () => {
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    process.env.NODE_ENV = "development";
    delete process.env.REDIS_URL;

    vi.resetModules();
    const mod = await import("../../server/lib/redis");

    // Dev behaviour is the same as before this hotfix: waitForRedisReady()
    // resolves immediately and helpers transparently use the in-memory
    // store. This guards against accidentally turning dev into prod-strict.
    await expect(mod.waitForRedisReady()).resolves.toBeUndefined();
    await mod.redisSet("hotfix3-dev-key", "alive", 60);
    await expect(mod.redisGet("hotfix3-dev-key")).resolves.toBe("alive");
    await expect(mod.redisGetDel("hotfix3-dev-key")).resolves.toBe("alive");
    await expect(mod.redisGet("hotfix3-dev-key")).resolves.toBeNull();
  });
});
