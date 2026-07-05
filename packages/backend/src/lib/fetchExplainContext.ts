import { supabase } from '../db/client.js';
import { redis } from '../cache/client.js';
import { HISTORICAL_TTL_SECONDS } from '../cache/client.js';
import { offsetDate } from '../utils/trajectory.js';
import { fetchAllPages } from '../utils/backfill.js';
import type { WeatherReading } from '@thailand-aq/types';
import { MS_PER_DAY, MS_PER_HOUR, ICT_OFFSET_MS } from '@thailand-aq/consts';
const GRID_MIN_COMPLETE = 4000;
const GRID_PAGE_SIZE = 1000;

export type CamsPoint = { lat: number; lng: number; pm25: number };

export type StationWeatherRecord = {
  date: string;
  wind_speed_kmh: number | null;
  wind_direction_deg: number | null;
  precipitation_sum: number | null;
  relative_humidity_2m: number | null;
};

export type PeerRow = {
  value: number;
  measured_at: string;
  station_id: string;
  stations: unknown;
};

export interface ExplainContext {
  anchorEndMs: number;
  since7d: string;
  since24h: string;
  since72h: string;
  until: string;
  d0: string;
  d1: string;
  d2: string;
  d3: string;
  d4: string;
  stationName: string;
  stationReadings: { value: number; measured_at: string }[];
  peerRows: PeerRow[];
  stationWeatherByDate: Map<string, StationWeatherRecord>;
  wind0: WeatherReading[];
  wind1: WeatherReading[];
  wind2: WeatherReading[];
  camsD0: CamsPoint[];
  camsD1: CamsPoint[];
  camsD2: CamsPoint[];
  pressureData: { score: number; fire_count: number; total_frp_mw: number } | null;
}

async function getGrid<T>(
  cacheKey: string,
  table: string,
  select: string,
  date: string,
): Promise<T[]> {
  const cached = await redis.get<T[]>(cacheKey);
  if (cached && cached.length >= GRID_MIN_COMPLETE) return cached;

  const all = await fetchAllPages<T>(
    (from, to) =>
      supabase.from(table).select(select).eq('date', date).range(from, to) as unknown as Promise<{
        data: T[] | null;
        error: { message: string } | null;
      }>,
    GRID_PAGE_SIZE,
  );

  if (!all.length) return [];
  void redis.set(cacheKey, all, { ex: HISTORICAL_TTL_SECONDS });
  return all;
}

function getWindGrid(date: string): Promise<WeatherReading[]> {
  return getGrid<WeatherReading>(
    `weather:${date}`,
    'weather_readings',
    'lat, lng, wind_speed_kmh, wind_direction_deg, precipitation_sum, relative_humidity_2m',
    date,
  );
}

function getCamsGrid(date: string): Promise<CamsPoint[]> {
  return getGrid<CamsPoint>(`cams:pm25:${date}`, 'cams_grid', 'lat, lng, pm25', date);
}

// Returns null when the station has no readings (→ 404 in the route handler).
export async function fetchExplainContext(
  stationId: string,
  selectedDate: string,
): Promise<ExplainContext | null> {
  const [yr, mo, dy] = selectedDate.split('-').map(Number);
  const anchorEndMs = Date.UTC(yr, mo - 1, dy) - ICT_OFFSET_MS + MS_PER_DAY;

  const since7d = new Date(anchorEndMs - 8 * MS_PER_DAY).toISOString();
  const since24h = new Date(anchorEndMs - 24 * MS_PER_HOUR).toISOString();
  const since72h = new Date(anchorEndMs - 72 * MS_PER_HOUR).toISOString();
  const until = new Date(anchorEndMs).toISOString();

  const d0 = selectedDate;
  const d1 = offsetDate(selectedDate, -1);
  const d2 = offsetDate(selectedDate, -2);
  const d3 = offsetDate(selectedDate, -3);
  const d4 = offsetDate(selectedDate, -4);

  const [
    stationRows,
    peerRowsResult,
    stationWeatherRows,
    wind0,
    wind1,
    wind2,
    camsD0,
    camsD1,
    camsD2,
    pressureResult,
  ] = await Promise.all([
    supabase
      .from('station_readings')
      .select('value, measured_at, stations(id, name)')
      .eq('station_id', stationId)
      .gte('measured_at', since7d)
      .lt('measured_at', until)
      .order('measured_at', { ascending: false })
      .limit(170),

    supabase
      .from('station_readings')
      .select('value, measured_at, station_id, stations(id, name, lat, lng)')
      .gte('measured_at', since24h)
      .lt('measured_at', until)
      .neq('station_id', stationId)
      .order('measured_at', { ascending: false }),

    supabase
      .from('station_weather')
      .select('date, wind_speed_kmh, wind_direction_deg, precipitation_sum, relative_humidity_2m')
      .eq('station_id', stationId)
      .in('date', [d0, d1, d2, d3, d4]),

    getWindGrid(d0),
    getWindGrid(d1),
    getWindGrid(d2),

    getCamsGrid(d0),
    getCamsGrid(d1),
    getCamsGrid(d2),

    supabase
      .from('station_fire_pressure')
      .select('score, fire_count, total_frp_mw')
      .eq('station_id', stationId)
      .eq('date', d0)
      .maybeSingle(),
  ]);

  if (stationRows.error) throw new Error(stationRows.error.message);
  if (!stationRows.data?.length) return null;

  type StationJoin = { id: string; name: string } | null;
  const stationName = (stationRows.data[0].stations as unknown as StationJoin)?.name ?? stationId;

  const stationWeatherByDate = new Map<string, StationWeatherRecord>();
  for (const row of (stationWeatherRows.data ?? []) as StationWeatherRecord[]) {
    stationWeatherByDate.set(row.date, row);
  }

  return {
    anchorEndMs,
    since7d,
    since24h,
    since72h,
    until,
    d0,
    d1,
    d2,
    d3,
    d4,
    stationName,
    stationReadings: stationRows.data as { value: number; measured_at: string }[],
    peerRows: (peerRowsResult.data ?? []) as PeerRow[],
    stationWeatherByDate,
    wind0,
    wind1,
    wind2,
    camsD0,
    camsD1,
    camsD2,
    pressureData: pressureResult.data as {
      score: number;
      fire_count: number;
      total_frp_mw: number;
    } | null,
  };
}
