import { MS_PER_DAY } from '@thailand-aq/consts';
import { cacheGet, cacheSet } from '../cache/safe.js';
import { bangkokDateString } from '../utils/bkkDate.js';
import { checkDayCompleteness } from './dayCompleteness.js';

const CACHE_KEY = 'latest-complete-date';
const CACHE_TTL_SECONDS = 30 * 60; // 30 min — refreshes well within the daily ingest window
export const LATEST_DATE_LOOKBACK_DAYS = 7;

/**
 * The newest of the last 7 Bangkok days that has the full CAMS grid, wind data and at least one
 * station reading, or null when none does. Cached for 30 minutes.
 */
export async function getLatestCompleteDate(): Promise<string | null> {
  const cached = await cacheGet<string>(CACHE_KEY);
  if (cached) return cached;

  const now = Date.now();
  for (let offset = 1; offset <= LATEST_DATE_LOOKBACK_DAYS; offset++) {
    const date = bangkokDateString(now - offset * MS_PER_DAY);
    const { isComplete } = await checkDayCompleteness(date);
    if (isComplete) {
      void cacheSet(CACHE_KEY, date, { ex: CACHE_TTL_SECONDS });
      return date;
    }
  }
  return null;
}
