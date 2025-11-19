import { createClient } from 'redis';
import { logProgress } from '../utils.js';

const DEFAULT_TTL_SECONDS = 60 * 60 * 24; // 24 hours
let redisClient = null;
let redisConnectPromise = null;

const getRedisUrl = () => process.env.REDIS_URL || process.env.VERCEL_REDIS_URL || null;

async function getRedisClient() {
  const redisUrl = getRedisUrl();
  if (!redisUrl) {
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (!redisConnectPromise) {
    redisClient = createClient({
      url: redisUrl
    });

    redisClient.on('error', (err) => {
      logProgress(`Redis error: ${err.message}`, 'error');
    });

    redisConnectPromise = redisClient.connect().catch((err) => {
      logProgress(`Redis connection failed: ${err.message}`, 'error');
      redisConnectPromise = null;
      redisClient = null;
      return null;
    });
  }

  const client = await redisConnectPromise;
  return client?.isOpen ? client : null;
}

export async function getCache(key) {
  try {
    const client = await getRedisClient();
    if (!client) {
      logProgress(`Redis client not available for key: ${key}`, 'warn');
      return null;
    }

    const data = await client.get(key);
    if (!data) {
      logProgress(`Cache miss for key: ${key}`, 'info');
      return null;
    }

    const parsed = JSON.parse(data);
    logProgress(`Cache hit for key: ${key}`, 'success');
    logProgress(`Cache data structure: ${JSON.stringify(Object.keys(parsed || {}))}`, 'info');
    
    // If data has cached_at timestamp, return it along with the data
    if (parsed && typeof parsed === 'object' && parsed.cached_at !== undefined) {
      logProgress(`Cache has cached_at, using new format`, 'info');
      return {
        data: parsed.data !== undefined ? parsed.data : parsed,
        cached_at: parsed.cached_at
      };
    }
    
    // Handle old format (data without cached_at wrapper)
    logProgress(`Cache does not have cached_at, using old format`, 'info');
    return parsed;
  } catch (error) {
    logProgress(`Redis get error for key ${key}: ${error.message}`, 'error');
    return null;
  }
}

export async function setCache(key, value, ttlSeconds = DEFAULT_TTL_SECONDS) {
  try {
    const client = await getRedisClient();
    if (!client) {
      logProgress(`Redis client not available, skipping cache set for key: ${key}`, 'warn');
      return;
    }

    // Wrap value with cached_at timestamp
    const cacheValue = {
      data: value,
      cached_at: new Date().toISOString()
    };

    await client.set(key, JSON.stringify(cacheValue), {
      EX: ttlSeconds
    });
    logProgress(`Cache set for key: ${key} (TTL: ${ttlSeconds}s)`, 'success');
  } catch (error) {
    logProgress(`Redis set error for key ${key}: ${error.message}`, 'error');
  }
}

export async function deleteCache(key) {
  try {
    const client = await getRedisClient();
    if (!client) {
      return;
    }

    await client.del(key);
  } catch (error) {
    logProgress(`Redis delete error for key ${key}: ${error.message}`, 'error');
  }
}

export { DEFAULT_TTL_SECONDS };

