import {
  runCityBlend,
  type CityBlendSource,
  type CityHourRow,
  type CityHourStore,
  type CityStations,
} from './city-blend.js';
import {
  runCityForecast,
  type CityForecastSource,
  type CityForecastStore,
} from './city-forecast.js';

/**
 * Blends the hour, forecasts from it, then stores the blend. The blend goes last: storing it
 * changes the API's page cache key, and a page built before the forecast was stored would be cached
 * for the hour without it. The cost: when the blend write fails the forecast is already stored, and
 * a page rebuilt under the old key shows it beside the previous hour's value until the next run.
 * A failed forecast does not stop the blend: it is returned for the caller to report. A failed
 * blend write throws.
 */
export async function runCityHour({
  validAt,
  cities,
  blendSource,
  blendStore,
  forecastSource,
  forecastStore,
}: {
  validAt: Date;
  cities: readonly CityStations[];
  blendSource: CityBlendSource;
  blendStore: CityHourStore;
  forecastSource: CityForecastSource;
  forecastStore: CityForecastStore;
}): Promise<{ rows: CityHourRow[]; forecastError: Error | null }> {
  const blend = await runCityBlend({ validAt, cities, source: blendSource });
  console.log('[city-blend] done', blend);

  let forecastError: Error | null = null;
  try {
    const forecast = await runCityForecast({
      blends: blend.rows,
      source: forecastSource,
      store: forecastStore,
    });
    console.log('[city-forecast] done', forecast);
    if (forecast.failed.length > 0) {
      forecastError = new Error(
        `[city-forecast] CAMS hours not read for ${forecast.failed.join(', ')}`,
      );
    }
  } catch (err) {
    forecastError = err instanceof Error ? err : new Error(String(err));
  }

  if (blend.rows.length > 0) await blendStore.upsert(blend.rows);
  console.log(`[city-blend] stored ${blend.rows.length} cities`);
  return { rows: blend.rows, forecastError };
}
