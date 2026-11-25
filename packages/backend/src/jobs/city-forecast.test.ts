import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));

import type { CityHourRow } from './city-blend.js';
import {
  runCityForecast,
  type CamsHour,
  type CityForecastRow,
  type CityForecastSource,
} from './city-forecast.js';

const HOUR_MS = 3_600_000;
const ISSUED_AT = '2026-11-24T15:00:00.000Z';
const RUN_AT = '2026-11-24T00:00:00+00:00';

const blend = (citySlug: string, pm25: number, camsPm25: number | null): CityHourRow => ({
  city_slug: citySlug,
  valid_at: ISSUED_AT,
  pm25,
  station_pm25: pm25,
  station_median: pm25,
  station_count: 3,
  station_weight: 0.6,
  cams_pm25: camsPm25,
  cams_run_at: camsPm25 === null ? null : RUN_AT,
});

const hours = (count: number, pm25: number): CamsHour[] =>
  Array.from({ length: count }, (_, i) => ({
    validAt: new Date(Date.parse(ISSUED_AT) + (i + 1) * HOUR_MS).toISOString(),
    pm25,
  }));

async function forecast(blends: CityHourRow[], source: CityForecastSource) {
  const stored: CityForecastRow[] = [];
  const result = await runCityForecast({
    blends,
    source,
    store: {
      upsert: (rows) => {
        stored.push(...rows);
        return Promise.resolve();
      },
    },
  });
  return { result, stored };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('runCityForecast', () => {
  it('stores the anchored daily means with the factor and run', async () => {
    const { stored } = await forecast([blend('chiang-mai', 40, 20)], {
      camsHoursAfter: () => Promise.resolve(hours(72, 10)),
    });

    expect(stored).toHaveLength(3);
    expect(stored[0]).toEqual({
      city_slug: 'chiang-mai',
      issued_at: ISSUED_AT,
      day: '2026-11-24',
      pm25: 20,
      hours: 1,
      factor: 2,
      cams_run_at: '2026-11-24T00:00:00.000Z',
    });
  });

  it('skips a city whose blend has no CAMS value, without reading CAMS', async () => {
    const camsHoursAfter = vi.fn(() => Promise.resolve(hours(72, 10)));

    const { result, stored } = await forecast([blend('lampang', 40, null)], { camsHoursAfter });

    expect(stored).toEqual([]);
    expect(result.withoutForecast).toEqual(['lampang']);
    expect(camsHoursAfter).not.toHaveBeenCalled();
  });

  it('skips a city whose CAMS run has no later hours', async () => {
    const { result } = await forecast([blend('lamphun', 40, 20)], {
      camsHoursAfter: () => Promise.resolve([]),
    });

    expect(result).toEqual({ stored: 0, withoutForecast: ['lamphun'], failed: [] });
  });

  it('reads the hours of the run the factor was computed against', async () => {
    const camsHoursAfter = vi.fn(() => Promise.resolve(hours(72, 10)));

    await forecast([blend('chiang-mai', 40, 20)], { camsHoursAfter });

    expect(camsHoursAfter).toHaveBeenCalledWith('chiang-mai', new Date(ISSUED_AT), RUN_AT);
  });

  it('still stores the other cities when one city’s CAMS read keeps failing', async () => {
    const camsHoursAfter = vi.fn((slug: string) =>
      slug === 'lampang' ? Promise.reject(new Error('timeout')) : Promise.resolve(hours(72, 10)),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result, stored } = await forecast(
      [blend('lampang', 40, 20), blend('chiang-mai', 40, 20)],
      { camsHoursAfter },
    );

    expect(result.failed).toEqual(['lampang']);
    expect(stored.map((r) => r.city_slug)).toEqual(['chiang-mai', 'chiang-mai', 'chiang-mai']);
    // pRetry: the first try and 2 retries
    expect(camsHoursAfter.mock.calls.filter(([slug]) => slug === 'lampang')).toHaveLength(3);
  }, 10_000);
});
