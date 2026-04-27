import Redis from "ioredis";

let redis: Redis | null = null;
let memoryStore: Map<string, { value: string; expiry?: number }> = new Map();
let useMemory = true;

const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.VITEST === "true" ||
  !!process.env.VITEST_WORKER_ID;

// Production-strict mode. When true:
//   * Boot must successfully connect to Redis within REDIS_CONNECT_TIMEOUT_MS
//     or the process refuses to start (initRedis throws).
//   * Every helper throws if `redis` is null OR if the underlying ioredis
//     call fails — no silent fallback to in-memory storage. This holds
//     EVEN when REDIS_URL is unset, so a misconfigured prod deploy that
//     somehow gets past the boot check still cannot serve fake state from
//     per-process memory.
// In all other cases (dev, test, dev-with-flaky-Redis), the existing
// in-memory fallback is preserved so local development and the vitest suite
// behave exactly as they did before this hotfix.
const REDIS_REQUIRED = process.env.NODE_ENV === "production" && !isTestEnv;

const REDIS_CONNECT_TIMEOUT_MS = 10_000;

function initRedis(): Promise<void> {
  if (isTestEnv) {
    console.log("[redis] Test environment detected, using in-memory store");
    return Promise.resolve();
  }
  const url = process.env.REDIS_URL;

  if (!url) {
    if (process.env.NODE_ENV === "production") {
      // Missing REDIS_URL in prod is the exact same silent-degrade trap
      // as an unreachable host — fail loud so the deploy stops booting
      // instead of quietly serving from per-process memory.
      const err = new Error(
        "[redis] REDIS_URL is required in production — refusing to boot",
      );
      console.error(err.message);
      return Promise.reject(err);
    }
    console.log("[redis] No REDIS_URL, using in-memory store");
    return Promise.resolve();
  }

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 2000),
      lazyConnect: true,
    });
  } catch (e: any) {
    if (REDIS_REQUIRED) {
      console.error("[redis] Init failed — refusing to boot in production:", e?.message);
      return Promise.reject(e);
    }
    console.log("[redis] Init failed, using in-memory store");
    useMemory = true;
    return Promise.resolve();
  }

  redis.on("connect", () => {
    console.log("[redis] Connected to Redis");
    useMemory = false;
  });
  // Keep the listener — removing it would let an EventEmitter `error` event
  // crash the process on every transient blip. Just don't flip useMemory:
  // ioredis auto-reconnects via retryStrategy, and silently swapping to
  // per-process memory is what corrupted OAuth pending state.
  redis.on("error", (err) => {
    console.error("[redis] Connection error:", err.message);
  });

  // redis.connect() returns a Promise<void> that resolves on the `ready`
  // event (after AUTH/SELECT complete). Race it against a hard timeout so
  // the process can either come up healthy or die loudly.
  if (REDIS_REQUIRED) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            "[redis] Failed to connect within 10s — refusing to boot in production",
          ),
        );
      }, REDIS_CONNECT_TIMEOUT_MS);

      redis!
        .connect()
        .then(() => {
          clearTimeout(timer);
          // The `connect` event handler already flipped useMemory; this is
          // belt-and-braces for ordering across ioredis versions.
          useMemory = false;
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(
            new Error(
              `[redis] Failed to connect — refusing to boot in production: ${err?.message ?? err}`,
            ),
          );
        });
    });
  }

  // Dev with REDIS_URL: try, but fall back to memory on failure (today's behaviour).
  return redis
    .connect()
    .then(() => {
      useMemory = false;
    })
    .catch(() => {
      console.log("[redis] Could not connect, using in-memory store");
      useMemory = true;
    });
}

const initPromise: Promise<void> = initRedis();

// Surface unhandled rejection of initPromise so a missing/late awaitor
// in dev doesn't crash the process at an unexpected time. The boot path
// in server/index.ts awaits this explicitly.
initPromise.catch(() => {
  /* awaited in server boot — see waitForRedisReady() */
});

export function waitForRedisReady(): Promise<void> {
  return initPromise;
}

function cleanExpired(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiry && Date.now() > entry.expiry) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function requireRedisOrThrow(): Redis {
  if (!redis) {
    throw new Error("[redis] Required in production but not connected");
  }
  return redis;
}

export async function redisGet(key: string): Promise<string | null> {
  if (REDIS_REQUIRED) {
    return requireRedisOrThrow().get(key);
  }
  if (!useMemory && redis) {
    return redis.get(key);
  }
  return cleanExpired(key);
}

export async function redisSet(key: string, value: string, exSeconds?: number): Promise<void> {
  if (REDIS_REQUIRED) {
    const r = requireRedisOrThrow();
    if (exSeconds) {
      await r.set(key, value, "EX", exSeconds);
    } else {
      await r.set(key, value);
    }
    return;
  }
  if (!useMemory && redis) {
    if (exSeconds) {
      await redis.set(key, value, "EX", exSeconds);
    } else {
      await redis.set(key, value);
    }
    return;
  }
  memoryStore.set(key, {
    value,
    expiry: exSeconds ? Date.now() + exSeconds * 1000 : undefined,
  });
}

export async function redisIncr(key: string): Promise<number> {
  if (REDIS_REQUIRED) {
    return requireRedisOrThrow().incr(key);
  }
  if (!useMemory && redis) {
    return redis.incr(key);
  }
  const val = cleanExpired(key);
  const num = (parseInt(val || "0") || 0) + 1;
  const entry = memoryStore.get(key);
  memoryStore.set(key, { value: String(num), expiry: entry?.expiry });
  return num;
}

export async function redisDecr(key: string): Promise<number> {
  if (REDIS_REQUIRED) {
    return requireRedisOrThrow().decr(key);
  }
  if (!useMemory && redis) {
    return redis.decr(key);
  }
  const val = cleanExpired(key);
  const num = (parseInt(val || "0") || 0) - 1;
  const entry = memoryStore.get(key);
  memoryStore.set(key, { value: String(num), expiry: entry?.expiry });
  return num;
}

export async function redisDecrBy(key: string, amount: number): Promise<number> {
  if (REDIS_REQUIRED) {
    return requireRedisOrThrow().decrby(key, amount);
  }
  if (!useMemory && redis) {
    return redis.decrby(key, amount);
  }
  const val = cleanExpired(key);
  const num = (parseInt(val || "0") || 0) - amount;
  const entry = memoryStore.get(key);
  memoryStore.set(key, { value: String(num), expiry: entry?.expiry });
  return num;
}

export async function redisIncrBy(key: string, amount: number): Promise<number> {
  if (REDIS_REQUIRED) {
    return requireRedisOrThrow().incrby(key, amount);
  }
  if (!useMemory && redis) {
    return redis.incrby(key, amount);
  }
  const val = cleanExpired(key);
  const num = (parseInt(val || "0") || 0) + amount;
  const entry = memoryStore.get(key);
  memoryStore.set(key, { value: String(num), expiry: entry?.expiry });
  return num;
}

export async function redisDel(key: string): Promise<void> {
  if (REDIS_REQUIRED) {
    await requireRedisOrThrow().del(key);
    return;
  }
  if (!useMemory && redis) {
    await redis.del(key);
    return;
  }
  memoryStore.delete(key);
}

export async function redisGetDel(key: string): Promise<string | null> {
  // Atomic read-and-delete. Required by callers that must guarantee
  // single-use semantics (e.g. OAuth pending-request consumption on
  // /oauth/consent). ioredis ^5.10 (see package.json) ships native GETDEL
  // (Redis 6.2+), which is invoked directly here — no GET+DEL fallback,
  // because that would leave a race window where two concurrent consents
  // could both succeed.
  if (REDIS_REQUIRED) {
    const v = await (requireRedisOrThrow() as any).getdel(key);
    return v ?? null;
  }
  if (!useMemory && redis) {
    const v = await (redis as any).getdel(key);
    return v ?? null;
  }
  const v = cleanExpired(key);
  if (v !== null) memoryStore.delete(key);
  return v;
}

export async function redisExpire(key: string, seconds: number): Promise<void> {
  if (REDIS_REQUIRED) {
    await requireRedisOrThrow().expire(key, seconds);
    return;
  }
  if (!useMemory && redis) {
    await redis.expire(key, seconds);
    return;
  }
  const entry = memoryStore.get(key);
  if (entry) {
    entry.expiry = Date.now() + seconds * 1000;
  }
}

export async function redisKeys(pattern: string): Promise<string[]> {
  if (REDIS_REQUIRED) {
    return requireRedisOrThrow().keys(pattern);
  }
  if (!useMemory && redis) {
    return redis.keys(pattern);
  }
  const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
  const keys: string[] = [];
  for (const [key] of memoryStore) {
    if (regex.test(key) && cleanExpired(key) !== null) {
      keys.push(key);
    }
  }
  return keys;
}

export async function redisExists(key: string): Promise<boolean> {
  if (REDIS_REQUIRED) {
    return (await requireRedisOrThrow().exists(key)) === 1;
  }
  if (!useMemory && redis) {
    return (await redis.exists(key)) === 1;
  }
  return cleanExpired(key) !== null;
}

export const REDIS_KEYS = {
  budget: (membershipId: string) => `allotly:budget:${membershipId}`,
  concurrent: (membershipId: string) => `allotly:concurrent:${membershipId}`,
  request: (membershipId: string, requestId: string) => `allotly:req:${membershipId}:${requestId}`,
  requestPattern: (membershipId: string) => `allotly:req:${membershipId}:*`,
  ratelimit: (membershipId: string) => `allotly:ratelimit:${membershipId}`,
  bundleRedemptions: (bundleId: string) => `allotly:bundle:${bundleId}:redemptions`,
  bundleRequests: (bundleId: string) => `allotly:bundle:${bundleId}:requests`,
  apiKeyCache: (keyHash: string) => `allotly:apikey:${keyHash}`,
  modelPrice: (provider: string, model: string) => `allotly:modelprice:${provider}:${model}`,
  azureDeployments: (orgId: string) => `allotly:azure:deployments:${orgId}`,
};
