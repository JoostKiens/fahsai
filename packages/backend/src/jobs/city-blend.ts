import pRetry from 'p-retry';
import { supabase } from '../db/client.js';
import { blendCityValue } from '../lib/cityBlend.js';
import type { StationNearCity } from '../lib/cityStations.js';
import { fetchCityCamsAt, fetchNewestCityCamsRun } from '../lib/fetchCityCams.js';
import { fetchAllPages } from '../utils/backfill.js';

const LOG = '[city-blend]';
const HOUR_MS = 3_600_000;
const PAGE_SIZE = 1000;

export type CityStations = { slug: string; stations: readonly StationNearCity[] };

export type CityHourRow = {
  city_slug: string;
  valid_at: string;
  pm25: number;
  station_pm25: number | null;
  station_median: number | null;
  station_count: number;
  station_weight: number;
  cams_pm25: number | null;
  cams_run_at: string | null;
};

export type CityBlendSource = {
  /** pm25 by station id, for the hourly readings stamped validAt */
  stationValues(stationIds: string[], validAt: Date): Promise<Map<string, number>>;
  camsAt(slug: string, validAt: Date): Promise<number | null>;
  newestCamsRun(): Promise<Date | null>;
};

export type CityHourStore = { upsert(rows: CityHourRow[]): Promise<void> };

/** The hour whose station values are out at `now`: the one that ended at the top of this hour. */
export function blendHour(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Blends each city's station readings for the hour ending at validAt with CAMS for the same
 * moment, and stores one row per city. A city with neither gets no row.
 */
export async function runCityBlend({
  validAt,
  cities,
  source,
  store,
}: {
  validAt: Date;
  cities: readonly CityStations[];
  source: CityBlendSource;
  store: CityHourStore;
}): Promise<{ stored: number; withoutValue: string[] }> {
  const ids = [...new Set(cities.flatMap((c) => c.stations.map((s) => s.id)))];
  const values = await source.stationValues(ids, validAt);
  const camsRunAt = await source.newestCamsRun();

  const rows: CityHourRow[] = [];
  const withoutValue: string[] = [];
  for (const city of cities) {
    const camsPm25 = await source.camsAt(city.slug, validAt);
    const stations = city.stations.flatMap((s) => {
      const pm25 = values.get(s.id);
      return pm25 === undefined ? [] : [{ lat: s.lat, lng: s.lng, distanceKm: s.distanceKm, pm25 }];
    });
    const blend = blendCityValue(stations, camsPm25);
    if (blend === null) {
      withoutValue.push(city.slug);
      continue;
    }
    rows.push({
      city_slug: city.slug,
      valid_at: validAt.toISOString(),
      pm25: blend.pm25,
      station_pm25: blend.stationPm25,
      station_median: blend.stationMedian,
      station_count: blend.stationCount,
      station_weight: blend.stationWeight,
      cams_pm25: camsPm25,
      cams_run_at: camsPm25 === null || camsRunAt === null ? null : camsRunAt.toISOString(),
    });
  }

  if (rows.length > 0) await store.upsert(rows);
  if (withoutValue.length > 0) console.warn(`${LOG} no value for ${withoutValue.join(', ')}`);
  console.log(`${LOG} stored ${rows.length} cities for ${validAt.toISOString()}`);
  return { stored: rows.length, withoutValue };
}

export const supabaseCityBlendSource: CityBlendSource = {
  async stationValues(stationIds, validAt) {
    const rows = await fetchAllPages<{ station_id: string; pm25: number }>(
      (from, to) =>
        supabase
          .from('station_readings_hourly')
          .select('station_id, pm25')
          .in('station_id', stationIds)
          .eq('measured_at', validAt.toISOString())
          .order('station_id')
          .range(from, to),
      PAGE_SIZE,
    );
    return new Map(rows.map((r) => [r.station_id, r.pm25]));
  },
  camsAt: fetchCityCamsAt,
  newestCamsRun: fetchNewestCityCamsRun,
};

export const supabaseCityHourStore: CityHourStore = {
  async upsert(rows) {
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('city_pm25_hourly')
          .upsert(rows, { onConflict: 'city_slug,valid_at' });
        if (error) throw new Error(`${LOG} upsert failed: ${error.message}`);
      },
      { retries: 3, minTimeout: 1_000, factor: 2 },
    );
  },
};
