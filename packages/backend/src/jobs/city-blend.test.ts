import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));

import type { StationNearCity } from '../lib/cityStations.js';
import {
  blendHour,
  runCityBlend,
  type CityBlendSource,
  type CityHourRow,
  type CityStations,
} from './city-blend.js';

const VALID_AT = new Date('2026-11-24T12:00:00Z');
const RUN_AT = new Date('2026-11-24T00:00:00Z');

const station = (id: string, northDeg: number): StationNearCity => ({
  id,
  name: id,
  country: 'TH',
  provider: null,
  lat: 18.79 + northDeg,
  lng: 98.98,
  distanceKm: northDeg * 111.2,
});

function sourceWith(values: Record<string, number>, cams: Record<string, number>): CityBlendSource {
  return {
    stationValues: () => Promise.resolve(new Map(Object.entries(values))),
    camsAt: (slug) =>
      Promise.resolve(
        cams[slug] === undefined ? null : { pm25: cams[slug], runAt: RUN_AT.toISOString() },
      ),
  };
}

async function blend(cities: CityStations[], source: CityBlendSource) {
  const stored: CityHourRow[] = [];
  const result = await runCityBlend({
    validAt: VALID_AT,
    cities,
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

describe('blendHour', () => {
  it('is the top of the current hour', () => {
    expect(blendHour(new Date('2026-11-24T12:45:10Z'))).toEqual(VALID_AT);
  });
});

describe('runCityBlend', () => {
  it('stores the blend with its inputs', async () => {
    const { stored } = await blend(
      [{ slug: 'chiang-mai', stations: [station('1', 0.01)] }],
      sourceWith({ '1': 60 }, { 'chiang-mai': 30 }),
    );

    expect(stored).toEqual([
      {
        city_slug: 'chiang-mai',
        valid_at: '2026-11-24T12:00:00.000Z',
        pm25: 40,
        station_pm25: 60,
        station_median: 60,
        station_count: 1,
        station_weight: 1 / 3,
        cams_pm25: 30,
        cams_run_at: '2026-11-24T00:00:00.000Z',
      },
    ]);
  });

  it('ignores footprint stations without a reading this hour', async () => {
    const { stored } = await blend(
      [{ slug: 'chiang-mai', stations: [station('1', 0.01), station('2', 0.05)] }],
      sourceWith({ '1': 60 }, { 'chiang-mai': 30 }),
    );

    expect(stored[0].station_count).toBe(1);
  });

  it('leaves out the CAMS run when the city has no CAMS value', async () => {
    const { stored } = await blend(
      [{ slug: 'lampang', stations: [station('1', 0.01)] }],
      sourceWith({ '1': 60 }, {}),
    );

    expect(stored[0]).toMatchObject({ pm25: 60, cams_pm25: null, cams_run_at: null });
  });

  it('stores no row for a city with neither stations nor CAMS', async () => {
    const { result, stored } = await blend([{ slug: 'lamphun', stations: [] }], sourceWith({}, {}));

    expect(stored).toEqual([]);
    expect(result.withoutValue).toEqual(['lamphun']);
  });
});
