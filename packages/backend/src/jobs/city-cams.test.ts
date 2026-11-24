import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));

import type { CityDef } from '../data/cities.js';
import { AdsHttpError } from '../utils/camsAds.js';
import type { Grib1Message } from '../utils/grib1.js';
import {
  cityRows,
  latestRunAt,
  LEAD_HOURS,
  runCityCamsIngest,
  type CityCamsRow,
  type CityCamsStore,
} from './city-cams.js';

const CITY: CityDef = {
  slug: 'chiang-mai',
  name: 'Chiang Mai',
  country: 'TH',
  lat: 18.7883,
  lng: 98.9853,
  zoom: 10,
  radiusKm: 20,
};
const RUN_AT = new Date('2026-11-24T00:00:00Z');

// The ADS grid, every cell at the same PM2.5 (in kg/m³, as the GRIB holds it).
function message(leadHour: number, microgramsPerM3 = 20): Grib1Message {
  return {
    values: new Float64Array(64 * 75).fill(microgramsPerM3 * 1e-9),
    ni: 64,
    nj: 75,
    lat1: 30.4,
    lng1: 88.8,
    dLat: 0.4,
    dLng: 0.4,
    leadHour,
  };
}
const fullRun = () => LEAD_HOURS.map((hour) => message(hour));

function fakeStore(storedRows = 0) {
  const replaced: CityCamsRow[][] = [];
  const store: CityCamsStore = {
    countRun: () => Promise.resolve(storedRows),
    replace: (rows) => {
      replaced.push(rows);
      return Promise.resolve();
    },
  };
  return { store, replaced };
}

describe('latestRunAt', () => {
  it.each([
    ['2026-11-24T11:00:00Z', '2026-11-24T00:00:00.000Z'],
    ['2026-11-24T12:00:00Z', '2026-11-24T00:00:00.000Z'],
    ['2026-11-24T23:00:00Z', '2026-11-24T12:00:00.000Z'],
    ['2026-11-25T00:00:00Z', '2026-11-24T12:00:00.000Z'],
    ['2026-11-24T09:59:00Z', '2026-11-23T12:00:00.000Z'],
  ])('at %s picks the run of %s', (now, run) => {
    expect(latestRunAt(new Date(now)).toISOString()).toBe(run);
  });
});

describe('cityRows', () => {
  it('gives one row per city and lead hour, in µg/m³, stamped with its valid hour', () => {
    const rows = cityRows({ messages: fullRun(), cities: [CITY], runAt: RUN_AT });

    expect(rows).toHaveLength(121);
    expect(rows.find((row) => row.lead_hour === 120)).toEqual({
      city_slug: 'chiang-mai',
      valid_at: '2026-11-29T00:00:00.000Z',
      pm25: 20,
      run_at: '2026-11-24T00:00:00.000Z',
      lead_hour: 120,
    });
  });

  it('throws when a lead hour is missing', () => {
    expect(() => cityRows({ messages: fullRun().slice(1), cities: [CITY], runAt: RUN_AT })).toThrow(
      /expected lead hours 0 to 120/,
    );
  });
});

describe('runCityCamsIngest', () => {
  const now = new Date('2026-11-24T11:00:00Z');

  it('stores the newest run', async () => {
    const { store, replaced } = fakeStore();
    const fetchRun = vi.fn(() => Promise.resolve(fullRun()));

    const result = await runCityCamsIngest({ now, cities: [CITY], fetchRun, store });

    expect(result).toEqual({ status: 'stored', runAt: '2026-11-24T00:00:00.000Z', rows: 121 });
    expect(fetchRun).toHaveBeenCalledWith(RUN_AT);
    expect(replaced[0]).toHaveLength(121);
  });

  it('does not fetch a run that is already stored in full', async () => {
    const { store, replaced } = fakeStore(121);
    const fetchRun = vi.fn(() => Promise.resolve(fullRun()));

    const result = await runCityCamsIngest({ now, cities: [CITY], fetchRun, store });

    expect(result.status).toBe('already-stored');
    expect(fetchRun).not.toHaveBeenCalled();
    expect(replaced).toEqual([]);
  });

  it('stops without failing when the ADS does not hold the run yet', async () => {
    const { store, replaced } = fakeStore();
    const notYet = new AdsHttpError(
      400,
      '{"detail":"Request has not produced a valid combination of values"}',
    );

    const result = await runCityCamsIngest({
      now,
      cities: [CITY],
      fetchRun: () => Promise.reject(notYet),
      store,
    });

    expect(result.status).toBe('not-published');
    expect(replaced).toEqual([]);
  });

  it('fails on any other ADS error', async () => {
    const { store } = fakeStore();
    const badKey = new AdsHttpError(401, 'unauthorised');

    await expect(
      runCityCamsIngest({ now, cities: [CITY], fetchRun: () => Promise.reject(badKey), store }),
    ).rejects.toBe(badKey);
  });
});
