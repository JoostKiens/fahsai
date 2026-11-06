import { beforeEach, describe, expect, it } from 'vitest';
import { clearTables, seed } from '../test/integration/db.js';
import { fetchCityStations } from './fetchCityStations.js';

// One degree of latitude is about 111.2 km.
const KM = 1 / 111.2;
const CENTRE = { lat: 18.79, lng: 98.98 };

function station(id: string, kmNorth: number, overrides: object = {}) {
  return {
    id,
    name: `Station ${id}`,
    lat: CENTRE.lat + kmNorth * KM,
    lng: CENTRE.lng,
    country: 'TH',
    provider: 'OpenAQ',
    ...overrides,
  };
}

const ids = (stations: { id: string }[]) => stations.map((s) => s.id);

describe('fetchCityStations against a real database', () => {
  beforeEach(async () => {
    await clearTables();
  });

  it('gives the stations within the radius, nearest first, and leaves out the rest', async () => {
    await seed('stations', [station('far', 25), station('mid', 10), station('near', 1)]);

    expect(ids(await fetchCityStations(CENTRE))).toEqual(['near', 'mid']);
  });

  it('leaves out a station that has no coordinates', async () => {
    await seed('stations', [station('ok', 1), station('nowhere', 0, { lat: null, lng: null })]);

    expect(ids(await fetchCityStations(CENTRE))).toEqual(['ok']);
  });

  it('adds a station the city includes from beyond the radius', async () => {
    await seed('stations', [station('inside', 2), station('outside', 30)]);

    expect(ids(await fetchCityStations({ ...CENTRE, include: ['outside'] }))).toEqual([
      'inside',
      'outside',
    ]);
  });

  it('still leaves out an included station that has no coordinates', async () => {
    await seed('stations', [station('inside', 2), station('nowhere', 0, { lat: null, lng: null })]);

    expect(ids(await fetchCityStations({ ...CENTRE, include: ['nowhere'] }))).toEqual(['inside']);
  });

  it('leaves out a station the city excludes', async () => {
    await seed('stations', [station('keep', 2), station('drop', 3)]);

    expect(ids(await fetchCityStations({ ...CENTRE, exclude: ['drop'] }))).toEqual(['keep']);
  });

  it('gives each station with an empty country as an empty string', async () => {
    await seed('stations', [station('s', 1, { country: null })]);

    const [found] = await fetchCityStations(CENTRE);

    expect(found?.country).toBe('');
  });
});
