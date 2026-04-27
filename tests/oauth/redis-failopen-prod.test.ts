import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Hotfix #3 regression: in production, Redis helpers must throw rather
// than silently fall back to in-memory storage. We exercise the
// deterministic "REDIS_URL missing in production" path because the real
// 10s timeout race is too slow for a unit test (covered separately).

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

  it("every helper throws in production when redis is unavailable", async () => {
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    process.env.NODE_ENV = "production";
    delete process.env.REDIS_URL;

    vi.resetModules();
    const mod = await import("../../server/lib/redis");
    mod.waitForRedisReady().catch(() => {}); // swallow boot rejection

    // Asserted per-helper so a future contributor adding a helper without
    // the strict-mode guard sees a clear test failure.
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

  it("dev with no REDIS_URL still uses the in-memory fallback", async () => {
    delete process.env.VITEST;
    delete process.env.VITEST_WORKER_ID;
    process.env.NODE_ENV = "development";
    delete process.env.REDIS_URL;

    vi.resetModules();
    const mod = await import("../../server/lib/redis");

    await expect(mod.waitForRedisReady()).resolves.toBeUndefined();
    await mod.redisSet("hotfix3-dev-key", "alive", 60);
    await expect(mod.redisGet("hotfix3-dev-key")).resolves.toBe("alive");
    await expect(mod.redisGetDel("hotfix3-dev-key")).resolves.toBe("alive");
    await expect(mod.redisGet("hotfix3-dev-key")).resolves.toBeNull();
  });
});
