import pRetry from 'p-retry';
import { supabase } from '../db/client.js';
import { blendCityValue } from '../lib/cityBlend.js';
import type { StationNearCity } from '../lib/cityStations.js';
import { fetchAllPages } from '../utils/backfill.js';

const LOG = '[city-blend]';
const HOUR_MS = 3_600_000;
const PAGE_SIZE = 1000;
// PostgREST takes the ids in the URL, so a long list goes in chunks.
const STATION_ID_CHUNK = 100;

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
  /** pm25 by station id: each station's newest reading in the hour ending at validAt */
  stationValues(stationIds: string[], validAt: Date): Promise<Map<string, number>>;
  /** the city's CAMS value at validAt and the run it came from */
  camsAt(slug: string, validAt: Date): Promise<{ pm25: number; runAt: string } | null>;
};

export type CityHourStore = { upsert(rows: CityHourRow[]): Promise<void> };

/** The hour whose station values are out at `now`: the one that ended at the top of this hour. */
export function blendHour(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

/**
 * Blends each city's station readings for the hour ending at validAt with CAMS for the same
 * moment: one row per city, for the caller to store (city-hour.ts). A city with neither gets no
 * row.
 */
export async function runCityBlend({
  validAt,
  cities,
  source,
}: {
  validAt: Date;
  cities: readonly CityStations[];
  source: CityBlendSource;
}): Promise<{ rows: CityHourRow[]; withoutValue: string[] }> {
  const ids = [...new Set(cities.flatMap((c) => c.stations.map((s) => s.id)))];
  const values = await source.stationValues(ids, validAt);

  const rows: CityHourRow[] = [];
  const withoutValue: string[] = [];
  for (const city of cities) {
    const cams = await source.camsAt(city.slug, validAt);
    const camsPm25 = cams?.pm25 ?? null;
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
      cams_run_at: cams === null ? null : new Date(cams.runAt).toISOString(),
    });
  }

  if (withoutValue.length > 0) console.warn(`${LOG} no value for ${withoutValue.join(', ')}`);
  console.log(`${LOG} blended ${rows.length} cities for ${validAt.toISOString()}`);
  return { rows, withoutValue };
}

export const supabaseCityBlendSource: CityBlendSource = {
  // A window, not an exact match: a stamp that is not on the hour still counts for its hour.
  async stationValues(stationIds, validAt) {
    const from = new Date(validAt.getTime() - HOUR_MS).toISOString();
    const until = validAt.toISOString();
    const values = new Map<string, number>();
    for (let i = 0; i < stationIds.length; i += STATION_ID_CHUNK) {
      const chunk = stationIds.slice(i, i + STATION_ID_CHUNK);
      const rows = await fetchAllPages<{ station_id: string; pm25: number }>(
        (rangeFrom, rangeTo) =>
          supabase
            .from('station_readings_hourly')
            .select('station_id, pm25')
            .in('station_id', chunk)
            .gt('measured_at', from)
            .lte('measured_at', until)
            .order('station_id')
            .order('measured_at')
            .range(rangeFrom, rangeTo),
        PAGE_SIZE,
      );
      // ascending by time, so the last row per station is its newest
      for (const row of rows) values.set(row.station_id, row.pm25);
    }
    return values;
  },
  async camsAt(slug, validAt) {
    const { data, error } = await supabase
      .from('city_cams_hourly')
      .select('pm25, run_at')
      .eq('city_slug', slug)
      .eq('valid_at', validAt.toISOString())
      .maybeSingle<{ pm25: number; run_at: string }>();
    if (error) throw new Error(`city_cams_hourly: ${error.message}`);
    return data === null ? null : { pm25: data.pm25, runAt: data.run_at };
  },
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
