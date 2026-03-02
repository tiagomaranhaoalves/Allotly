import Redis from "ioredis";

let redis: Redis | null = null;
let memoryStore: Map<string, { value: string; expiry?: number }> = new Map();
let useMemory = true;

function initRedis() {
  const url = process.env.REDIS_URL;
  if (url) {
    try {
      redis = new Redis(url, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 200, 2000),
        lazyConnect: true,
      });
      redis.on("connect", () => {
        console.log("[redis] Connected to Redis");
        useMemory = false;
      });
      redis.on("error", (err) => {
        console.error("[redis] Connection error, falling back to memory:", err.message);
        useMemory = true;
      });
      redis.connect().catch(() => {
        console.log("[redis] Could not connect, using in-memory store");
        useMemory = true;
      });
    } catch {
      console.log("[redis] Init failed, using in-memory store");
      useMemory = true;
    }
  } else {
    console.log("[redis] No REDIS_URL, using in-memory store");
  }
}

initRedis();

function cleanExpired(key: string): string | null {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiry && Date.now() > entry.expiry) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

export async function redisGet(key: string): Promise<string | null> {
  if (!useMemory && redis) {
    return redis.get(key);
  }
  return cleanExpired(key);
}

export async function redisSet(key: string, value: string, exSeconds?: number): Promise<void> {
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
  if (!useMemory && redis) {
    await redis.del(key);
    return;
  }
  memoryStore.delete(key);
}

export async function redisExpire(key: string, seconds: number): Promise<void> {
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
};
