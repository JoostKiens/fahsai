import type { PM25GridPoint } from '@thailand-aq/types';
import { HISTORICAL_TTL_SECONDS } from '../cache/client.js';
import { cacheGet, cacheSet } from '../cache/safe.js';
import { supabase } from '../db/client.js';
import { fetchAllPages } from '../utils/backfill.js';

const PAGE_SIZE = 1000;
// Full CAMS grid is 63×73 = 4,599 points. Require ≥90% before caching to Redis
// so a rate-limited partial ingest never poisons the hot cache.
const MIN_COMPLETE_POINTS = 4000;

async function fetchCamsGridFromDb(date: string): Promise<PM25GridPoint[]> {
  return fetchAllPages<PM25GridPoint>(
    (from, to) =>
      supabase.from('cams_grid').select('lat, lng, pm25').eq('date', date).range(from, to),
    PAGE_SIZE,
  );
}

/** A day's CAMS grid: Redis first (cams:pm25:{date}, also read by the explain context), then the table. */
export async function getCamsGridForDate(date: string): Promise<PM25GridPoint[]> {
  let points = await cacheGet<PM25GridPoint[]>(`cams:pm25:${date}`);

  if (!points?.length || points.length < MIN_COMPLETE_POINTS) {
    points = await fetchCamsGridFromDb(date);

    // Only re-populate Redis when data is complete — partial ingests must not poison the cache.
    if (points.length >= MIN_COMPLETE_POINTS) {
      void cacheSet(`cams:pm25:${date}`, points, { ex: HISTORICAL_TTL_SECONDS });
    }
  }

  return points;
}
