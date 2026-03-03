import { describe, it, expect, beforeEach } from "vitest";
import {
  redisGet,
  redisSet,
  redisDecrBy,
  redisIncrBy,
  redisDel,
  redisIncr,
  redisDecr,
  REDIS_KEYS,
} from "../server/lib/redis";

beforeEach(async () => {
  await redisDel(REDIS_KEYS.budget("test-member-1"));
  await redisDel(REDIS_KEYS.budget("test-member-2"));
  await redisDel(REDIS_KEYS.concurrent("test-member-1"));
  await redisDel(REDIS_KEYS.ratelimit("test-member-1"));
  await redisDel(REDIS_KEYS.bundleRequests("test-bundle-1"));
});

describe("Redis budget reservation", () => {
  it("sets and gets a budget value", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "10000");
    const val = await redisGet(REDIS_KEYS.budget("test-member-1"));
    expect(val).toBe("10000");
  });

  it("decrements budget atomically", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "10000");
    const newVal = await redisDecrBy(REDIS_KEYS.budget("test-member-1"), 500);
    expect(newVal).toBe(9500);
  });

  it("allows budget to go negative (checked by caller)", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "100");
    const newVal = await redisDecrBy(REDIS_KEYS.budget("test-member-1"), 200);
    expect(newVal).toBe(-100);
  });

  it("refunds budget by incrementing", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "5000");
    await redisDecrBy(REDIS_KEYS.budget("test-member-1"), 300);
    const afterRefund = await redisIncrBy(REDIS_KEYS.budget("test-member-1"), 300);
    expect(afterRefund).toBe(5000);
  });

  it("adjusts budget after response (estimated > actual)", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "10000");
    const estimatedCost = 500;
    const actualCost = 300;
    await redisDecrBy(REDIS_KEYS.budget("test-member-1"), estimatedCost);
    const diff = estimatedCost - actualCost;
    const finalBudget = await redisIncrBy(REDIS_KEYS.budget("test-member-1"), diff);
    expect(finalBudget).toBe(10000 - actualCost);
  });

  it("adjusts budget after response (estimated < actual)", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "10000");
    const estimatedCost = 300;
    const actualCost = 500;
    await redisDecrBy(REDIS_KEYS.budget("test-member-1"), estimatedCost);
    const diff = estimatedCost - actualCost;
    const finalBudget = await redisDecrBy(REDIS_KEYS.budget("test-member-1"), Math.abs(diff));
    expect(finalBudget).toBe(10000 - actualCost);
  });
});

describe("Redis reconciliation logic", () => {
  it("detects drift between Redis and Postgres values", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "8000");
    const pgRemaining = 9500;
    const redisRemaining = parseInt((await redisGet(REDIS_KEYS.budget("test-member-1")))!);
    const drift = Math.abs(redisRemaining - pgRemaining);
    expect(drift).toBe(1500);
    expect(drift > 100).toBe(true);
  });

  it("restores Redis value from Postgres on drift", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "5000");
    const pgRemaining = 7500;

    const redisVal = parseInt((await redisGet(REDIS_KEYS.budget("test-member-1")))!);
    const drift = Math.abs(redisVal - pgRemaining);

    if (drift > 100) {
      await redisSet(REDIS_KEYS.budget("test-member-1"), String(pgRemaining));
    }

    const restored = await redisGet(REDIS_KEYS.budget("test-member-1"));
    expect(restored).toBe("7500");
  });

  it("does not restore when drift is within tolerance", async () => {
    await redisSet(REDIS_KEYS.budget("test-member-1"), "9950");
    const pgRemaining = 10000;

    const redisVal = parseInt((await redisGet(REDIS_KEYS.budget("test-member-1")))!);
    const drift = Math.abs(redisVal - pgRemaining);
    expect(drift).toBe(50);
    expect(drift > 100).toBe(false);

    const unchanged = await redisGet(REDIS_KEYS.budget("test-member-1"));
    expect(unchanged).toBe("9950");
  });

  it("initializes Redis from Postgres when key is missing", async () => {
    const val = await redisGet(REDIS_KEYS.budget("test-member-2"));
    expect(val).toBeNull();

    const pgRemaining = 15000;
    await redisSet(REDIS_KEYS.budget("test-member-2"), String(pgRemaining));

    const restored = await redisGet(REDIS_KEYS.budget("test-member-2"));
    expect(restored).toBe("15000");
  });
});

describe("Redis concurrency tracking", () => {
  it("increments concurrent request count", async () => {
    const count1 = await redisIncr(REDIS_KEYS.concurrent("test-member-1"));
    expect(count1).toBe(1);
    const count2 = await redisIncr(REDIS_KEYS.concurrent("test-member-1"));
    expect(count2).toBe(2);
  });

  it("decrements on release", async () => {
    await redisIncr(REDIS_KEYS.concurrent("test-member-1"));
    await redisIncr(REDIS_KEYS.concurrent("test-member-1"));
    const afterRelease = await redisDecr(REDIS_KEYS.concurrent("test-member-1"));
    expect(afterRelease).toBe(1);
  });

  it("rejects when over limit of 2", async () => {
    await redisIncr(REDIS_KEYS.concurrent("test-member-1"));
    await redisIncr(REDIS_KEYS.concurrent("test-member-1"));
    const count3 = await redisIncr(REDIS_KEYS.concurrent("test-member-1"));
    expect(count3).toBe(3);
    expect(count3 > 2).toBe(true);
  });

  it("cleans up by deleting key", async () => {
    await redisIncr(REDIS_KEYS.concurrent("test-member-1"));
    await redisDel(REDIS_KEYS.concurrent("test-member-1"));
    const val = await redisGet(REDIS_KEYS.concurrent("test-member-1"));
    expect(val).toBeNull();
  });
});

describe("Redis rate limiting", () => {
  it("tracks request count per minute window", async () => {
    const key = REDIS_KEYS.ratelimit("test-member-1");
    const count1 = await redisIncr(key);
    expect(count1).toBe(1);
    const count2 = await redisIncr(key);
    expect(count2).toBe(2);
  });

  it("identifies when plan limit is exceeded", async () => {
    const key = REDIS_KEYS.ratelimit("test-member-1");
    const planLimit = 10;
    for (let i = 0; i < planLimit; i++) {
      await redisIncr(key);
    }
    const overLimit = await redisIncr(key);
    expect(overLimit).toBe(11);
    expect(overLimit > planLimit).toBe(true);
  });
});

describe("Redis bundle request pool", () => {
  it("tracks bundle request usage", async () => {
    const key = REDIS_KEYS.bundleRequests("test-bundle-1");
    await redisSet(key, "0");
    const count = await redisIncr(key);
    expect(count).toBe(1);
  });

  it("detects exhaustion when used >= total", async () => {
    const key = REDIS_KEYS.bundleRequests("test-bundle-1");
    await redisSet(key, "999");
    const totalRequests = 1000;
    const used = await redisIncr(key);
    expect(used >= totalRequests).toBe(true);
  });
});

describe("REDIS_KEYS", () => {
  it("generates consistent key formats", () => {
    expect(REDIS_KEYS.budget("abc")).toBe("allotly:budget:abc");
    expect(REDIS_KEYS.concurrent("abc")).toBe("allotly:concurrent:abc");
    expect(REDIS_KEYS.ratelimit("abc")).toBe("allotly:ratelimit:abc");
    expect(REDIS_KEYS.bundleRequests("xyz")).toBe("allotly:bundle:xyz:requests");
    expect(REDIS_KEYS.bundleRedemptions("xyz")).toBe("allotly:bundle:xyz:redemptions");
    expect(REDIS_KEYS.apiKeyCache("hash1")).toBe("allotly:apikey:hash1");
  });
});
