import { describe, it, expect } from 'vitest';
import type { Station } from '@thailand-aq/types';
import { CITY_RADIUS_KM } from '../data/cities.js';
import { stationsNearCity } from './cityStations.js';

const CENTRE = { lat: 18.79, lng: 98.98 };
// One degree of latitude is about 111.2 km.
const KM = 1 / 111.2;

function station(id: string, kmNorth: number): Station {
  return {
    id,
    name: `Station ${id}`,
    lat: CENTRE.lat + kmNorth * KM,
    lng: CENTRE.lng,
    country: 'TH',
    provider: null,
  };
}

const ids = (stations: { id: string }[]) => stations.map((s) => s.id);

describe('stationsNearCity', () => {
  it('uses a radius of 20 km', () => {
    expect(CITY_RADIUS_KM).toBe(20);
  });

  it('keeps the stations within the radius, nearest first, and drops the others', () => {
    const stations = [station('far', 25), station('mid', 10), station('near', 1)];

    expect(ids(stationsNearCity(stations, CENTRE))).toEqual(['near', 'mid']);
  });

  it('reports each station’s distance in km', () => {
    const [near] = stationsNearCity([station('near', 10)], CENTRE);

    expect(near?.distanceKm).toBeCloseTo(10, 1);
  });

  it('breaks a tie in distance by the lower id, so the order is stable', () => {
    const stations = [station('b', 5), station('a', 5)];

    expect(ids(stationsNearCity(stations, CENTRE))).toEqual(['a', 'b']);
  });

  it('drops a station the city excludes, even inside the radius', () => {
    const stations = [station('keep', 2), station('drop', 3)];

    expect(ids(stationsNearCity(stations, { ...CENTRE, exclude: ['drop'] }))).toEqual(['keep']);
  });

  it('adds a station the city includes from beyond the radius, once', () => {
    const stations = [station('inside', 2), station('outside', 30)];

    const result = stationsNearCity(stations, { ...CENTRE, include: ['outside', 'inside'] });

    expect(ids(result)).toEqual(['inside', 'outside']);
  });

  it('ignores an included id that is not a known station', () => {
    expect(ids(stationsNearCity([station('a', 1)], { ...CENTRE, include: ['ghost'] }))).toEqual([
      'a',
    ]);
  });

  it('returns nothing when there are no stations', () => {
    expect(stationsNearCity([], CENTRE)).toEqual([]);
  });
});
