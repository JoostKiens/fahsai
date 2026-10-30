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

// Returns whether the write landed.
export async function cacheSet(
  key: string,
  value: unknown,
  { ex }: { ex: number },
): Promise<boolean> {
  try {
    await redis.set(key, value, { ex });
    return true;
  } catch (err) {
    logger.warn({ err, key }, 'cache write failed, skipping');
    return false;
  }
}

// For ingest jobs overwriting a key with fresh data: if the write fails, the old value must not keep
// being served, so fall back to deleting it (which reports if that fails too). Returns whether the
// new value landed.
export async function cacheReplace(
  key: string,
  value: unknown,
  { ex }: { ex: number },
): Promise<boolean> {
  if (await cacheSet(key, value, { ex })) return true;
  await cacheDel(key);
  return false;
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
