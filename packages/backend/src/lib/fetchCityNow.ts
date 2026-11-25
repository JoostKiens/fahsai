import { pcdBandIndex } from '@thailand-aq/consts';
import type { CityForecast, CityNow, CityStationHour } from '@thailand-aq/types';
import { supabase } from '../db/client.js';
import { fetchAllPages } from '../utils/backfill.js';
import { bangkokDateString } from '../utils/bkkDate.js';
import { cityRollingValue } from './cityBlend.js';
import type { StationNearCity } from './cityStations.js';

const HOUR_MS = 3_600_000;
const WINDOW_MS = 24 * HOUR_MS;
// as the ingest: older than this, a station has stopped reporting
const MEASURED_MAX_AGE_MS = 2 * HOUR_MS;
// The page shows the latest hour's time without a date, so an older hour (the hourly job stopped)
// would pass for today's. The blend lands at :45 for the hour that ended at :00.
const LATEST_MAX_AGE_MS = 2 * HOUR_MS;
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

/** When the city's newest hourly blend is for; null when it has none. */
export async function fetchNewestBlendHour(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('city_pm25_hourly')
    .select('valid_at')
    .eq('city_slug', slug)
    .order('valid_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ valid_at: string }>();
  if (error) throw new Error(`city_pm25_hourly: ${error.message}`);
  return data?.valid_at ?? null;
}

/** The headline value from the hourly blends of the last 24 h; null when it is too thin or old. */
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
  return cityNowFromRows(data, now);
}

export function cityNowFromRows(rows: readonly CityHourRow[], now: Date): CityNow | null {
  const latest = rows.at(-1);
  if (latest === undefined) return null;
  if (now.getTime() - Date.parse(latest.valid_at) > LATEST_MAX_AGE_MS) return null;
  const rolling = cityRollingValue(
    rows.map((r) => ({ pm25: r.pm25, stationMedian: r.station_median })),
  );
  if (rolling === null) return null;
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

type ForecastRow = {
  issued_at: string;
  day: string;
  pm25: number;
  hours: number;
  factor: number;
};

/** The newest forecast issued in the last 2 h, without days already over; null when none. */
export async function fetchCityForecast(slug: string, now: Date): Promise<CityForecast | null> {
  // a few issues of 3 days each
  const { data, error } = await supabase
    .from('city_forecast_daily')
    .select('issued_at, day, pm25, hours, factor')
    .eq('city_slug', slug)
    .gte('issued_at', new Date(now.getTime() - LATEST_MAX_AGE_MS).toISOString())
    .lte('issued_at', now.toISOString())
    .order('issued_at', { ascending: false })
    .order('day')
    .returns<ForecastRow[]>();
  if (error) throw new Error(`city_forecast_daily: ${error.message}`);
  return cityForecastFromRows(data, now);
}

/** Rows ordered newest issue first, then by day. */
export function cityForecastFromRows(rows: readonly ForecastRow[], now: Date): CityForecast | null {
  const newest = rows[0];
  if (newest === undefined) return null;
  const today = bangkokDateString(now);
  const days = rows
    .filter((r) => r.issued_at === newest.issued_at && r.day >= today)
    .map((r) => ({ date: r.day, pm25: r.pm25, band: pcdBandIndex(r.pm25), hours: r.hours }));
  if (days.length === 0) return null;
  return { issuedAt: new Date(newest.issued_at).toISOString(), factor: newest.factor, days };
}
