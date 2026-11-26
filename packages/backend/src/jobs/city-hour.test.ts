import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));

import type { CityBlendSource, CityStations } from './city-blend.js';
import type { CityForecastSource } from './city-forecast.js';
import { runCityHour } from './city-hour.js';

const HOUR_MS = 3_600_000;
const VALID_AT = new Date('2026-11-24T12:00:00Z');
const CITIES: CityStations[] = [{ slug: 'chiang-mai', stations: [] }];

// CAMS only (no stations), so the blend is the CAMS value
const blendSource: CityBlendSource = {
  stationValues: () => Promise.resolve(new Map()),
  camsAt: () => Promise.resolve({ pm25: 20, runAt: '2026-11-24T00:00:00Z' }),
};

const forecastSource: CityForecastSource = {
  camsHoursAfter: () =>
    Promise.resolve(
      Array.from({ length: 72 }, (_, i) => ({
        validAt: new Date(VALID_AT.getTime() + (i + 1) * HOUR_MS).toISOString(),
        pm25: 20,
      })),
    ),
};

function run({ forecastWrite = () => Promise.resolve(), blendWrite = () => Promise.resolve() }) {
  const writes: string[] = [];
  const result = runCityHour({
    validAt: VALID_AT,
    cities: CITIES,
    blendSource,
    forecastSource,
    blendStore: {
      upsert: async () => {
        writes.push('blend');
        await blendWrite();
      },
    },
    forecastStore: {
      upsert: async () => {
        writes.push('forecast');
        await forecastWrite();
      },
    },
  });
  return { result, writes };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('runCityHour', () => {
  it('stores the forecast before the blend', async () => {
    const { result, writes } = run({});

    expect(await result).toMatchObject({
      forecastError: null,
      rows: [{ city_slug: 'chiang-mai' }],
    });
    expect(writes).toEqual(['forecast', 'blend']);
  });

  it('still stores the blend when the forecast fails, and returns the error', async () => {
    const { result, writes } = run({ forecastWrite: () => Promise.reject(new Error('db down')) });

    expect((await result).forecastError?.message).toBe('db down');
    expect(writes).toEqual(['forecast', 'blend']);
  });

  it('throws when the blend write fails', async () => {
    const { result } = run({ blendWrite: () => Promise.reject(new Error('db down')) });

    await expect(result).rejects.toThrow('db down');
  });
});
