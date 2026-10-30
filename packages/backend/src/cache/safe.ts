import { redis } from './client.js';
import { logger } from '../lib/logger.js';
import { reportError } from '../lib/rollbar.js';

// Redis is only a cache in front of Supabase, so a Redis failure (outage, or Upstash stopping the
// database at its max budget) must degrade to a DB read instead of failing the request or job.

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    return await redis.get<T>(key);
  } catch (err) {
    logger.warn({ err, key }, 'cache read failed, treating as a miss');
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, { ex }: { ex: number }): Promise<void> {
  try {
    await redis.set(key, value, { ex });
  } catch (err) {
    logger.warn({ err, key }, 'cache write failed, skipping');
  }
}

// Reported, not just logged: a failed invalidation can leave a stale entry for up to its TTL, and
// someone may need to delete the key by hand.
export async function cacheDel(...keys: string[]): Promise<void> {
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.error({ err, keys }, 'cache invalidation failed, stale entries may be served');
    reportError(err, { keys });
  }
}
