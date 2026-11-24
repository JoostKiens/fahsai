import type { CityNow, CityStationHour } from '@thailand-aq/types';
import { supabase } from '../db/client.js';
import { fetchAllPages } from '../utils/backfill.js';
import { cityRollingValue } from './cityBlend.js';
import type { StationNearCity } from './cityStations.js';

const HOUR_MS = 3_600_000;
const WINDOW_MS = 24 * HOUR_MS;
// as the ingest: older than this, a station has stopped reporting
const MEASURED_MAX_AGE_MS = 2 * HOUR_MS;
const PAGE_SIZE = 1000;
// PostgREST takes the ids in the URL, so a long list goes in chunks.
const STATION_ID_CHUNK = 100;

type CityHourRow = {
  valid_at: string;
  pm25: number;
  station_median: number | null;
  station_count: number;
  station_weight: number;
  cams_pm25: number | null;
};

/** The headline value from the hourly blends of the last 24 h; null when there are none. */
export async function fetchCityNow(slug: string, now: Date): Promise<CityNow | null> {
  // at most 24 rows: one per hour
  const { data, error } = await supabase
    .from('city_pm25_hourly')
    .select('valid_at, pm25, station_median, station_count, station_weight, cams_pm25')
    .eq('city_slug', slug)
    .gt('valid_at', new Date(now.getTime() - WINDOW_MS).toISOString())
    .lte('valid_at', now.toISOString())
    .order('valid_at')
    .returns<CityHourRow[]>();
  if (error) throw new Error(`city_pm25_hourly: ${error.message}`);
  return cityNowFromRows(data);
}

export function cityNowFromRows(rows: readonly CityHourRow[]): CityNow | null {
  const rolling = cityRollingValue(
    rows.map((r) => ({ pm25: r.pm25, stationMedian: r.station_median })),
  );
  const latest = rows.at(-1);
  if (rolling === null || latest === undefined) return null;
  return {
    ...rolling,
    latest: {
      validAt: new Date(latest.valid_at).toISOString(),
      pm25: latest.pm25,
      stationCount: latest.station_count,
      stationWeight: latest.station_weight,
      camsPm25: latest.cams_pm25,
    },
  };
}

/** Each station's latest hourly value from the last 2 h, in the order of `stations`. */
export async function fetchMeasuredStations(
  stations: readonly StationNearCity[],
  now: Date,
): Promise<CityStationHour[]> {
  const since = new Date(now.getTime() - MEASURED_MAX_AGE_MS).toISOString();
  const latestById = new Map<string, { pm25: number; measuredAt: string }>();
  for (let i = 0; i < stations.length; i += STATION_ID_CHUNK) {
    const ids = stations.slice(i, i + STATION_ID_CHUNK).map((s) => s.id);
    const rows = await fetchAllPages<{ station_id: string; pm25: number; measured_at: string }>(
      (from, to) =>
        supabase
          .from('station_readings_hourly')
          .select('station_id, pm25, measured_at')
          .in('station_id', ids)
          .gte('measured_at', since)
          .order('station_id')
          .order('measured_at')
          .range(from, to),
      PAGE_SIZE,
    );
    // ascending by time, so the last row per station is its latest
    for (const row of rows) {
      latestById.set(row.station_id, {
        pm25: row.pm25,
        measuredAt: new Date(row.measured_at).toISOString(),
      });
    }
  }
  return stations.flatMap((s) => {
    const latest = latestById.get(s.id);
    return latest === undefined ? [] : [{ id: s.id, name: s.name, ...latest }];
  });
}
