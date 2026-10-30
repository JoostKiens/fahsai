import { Redis } from '@upstash/redis';

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token)
  throw new Error(
    'Missing Upstash Redis env vars: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required',
  );

// Redis is only a cache (see cache/safe.ts), so give up fast and fall back to Supabase: the client's
// default 5 retries with exponential backoff held each request for 10-14 s during an outage.
const COMMAND_TIMEOUT_MS = 2000;

export const redis = new Redis({
  url,
  token,
  retry: { retries: 0 },
  signal: () => AbortSignal.timeout(COMMAND_TIMEOUT_MS),
});

// All data the frontend requests is historical (T-1 to T-30) and immutable after ingestion.
export const HISTORICAL_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const CACHE_CONTROL_IMMUTABLE = `public, max-age=${HISTORICAL_TTL_SECONDS}`;
