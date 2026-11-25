import pRetry from 'p-retry';
import { supabase } from '../db/client.js';
import { anchorFactor, forecastDays } from '../lib/cityForecast.js';
import type { CityHourRow } from './city-blend.js';

const LOG = '[city-forecast]';

export type CityForecastRow = {
  city_slug: string;
  issued_at: string;
  day: string;
  pm25: number;
  hours: number;
  factor: number;
  cams_run_at: string;
};

export type CamsHour = { validAt: string; pm25: number; runAt: string };

export type CityForecastSource = {
  /** the city's CAMS hours after `after`, from the newest stored run */
  camsHoursAfter(slug: string, after: Date): Promise<CamsHour[]>;
};

export type CityForecastStore = { upsert(rows: CityForecastRow[]): Promise<void> };

/**
 * Anchors each city's CAMS forecast to its blend for the latest hour and stores the daily means.
 * A city whose blend has no CAMS value, or whose run has no later hours, gets no forecast.
 */
export async function runCityForecast({
  blends,
  source,
  store,
}: {
  /** the rows the hourly blend just stored, one per city, all for the same hour */
  blends: readonly CityHourRow[];
  source: CityForecastSource;
  store: CityForecastStore;
}): Promise<{ stored: number; withoutForecast: string[] }> {
  const rows: CityForecastRow[] = [];
  const withoutForecast: string[] = [];
  for (const blend of blends) {
    const factor = anchorFactor(blend.pm25, blend.cams_pm25);
    const issuedAt = new Date(blend.valid_at);
    const cams = factor === null ? [] : await source.camsHoursAfter(blend.city_slug, issuedAt);
    const days = factor === null ? [] : forecastDays({ issuedAt, factor, cams });
    if (factor === null || days.length === 0) {
      withoutForecast.push(blend.city_slug);
      continue;
    }
    // city_cams_hourly holds one run; the newest covers the moment a new run is being written
    const runAt = cams.reduce((newest, h) => (h.runAt > newest ? h.runAt : newest), cams[0].runAt);
    rows.push(
      ...days.map((d) => ({
        city_slug: blend.city_slug,
        issued_at: issuedAt.toISOString(),
        day: d.day,
        pm25: d.pm25,
        hours: d.hours,
        factor,
        cams_run_at: new Date(runAt).toISOString(),
      })),
    );
  }

  if (rows.length > 0) await store.upsert(rows);
  if (withoutForecast.length > 0)
    console.warn(`${LOG} no forecast for ${withoutForecast.join(', ')}`);
  console.log(
    `${LOG} stored ${rows.length} days for ${blends.length - withoutForecast.length} cities`,
  );
  return { stored: rows.length, withoutForecast };
}

export const supabaseCityForecastSource: CityForecastSource = {
  async camsHoursAfter(slug, after) {
    // at most 121 rows: one run's lead hours
    const { data, error } = await supabase
      .from('city_cams_hourly')
      .select('valid_at, pm25, run_at')
      .eq('city_slug', slug)
      .gt('valid_at', after.toISOString())
      .order('valid_at')
      .returns<{ valid_at: string; pm25: number; run_at: string }[]>();
    if (error) throw new Error(`city_cams_hourly: ${error.message}`);
    return data.map((r) => ({ validAt: r.valid_at, pm25: r.pm25, runAt: r.run_at }));
  },
};

export const supabaseCityForecastStore: CityForecastStore = {
  async upsert(rows) {
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('city_forecast_daily')
          .upsert(rows, { onConflict: 'city_slug,issued_at,day' });
        if (error) throw new Error(`${LOG} upsert failed: ${error.message}`);
      },
      { retries: 3, minTimeout: 1_000, factor: 2 },
    );
  },
};
