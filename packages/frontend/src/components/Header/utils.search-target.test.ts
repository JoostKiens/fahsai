import { describe, it, expect } from 'vitest';
import { pageSearchTarget } from './utils.search-target';

const CITIES = [
  { slug: 'chiang-mai', name: 'Chiang Mai' },
  { slug: 'bangkok', name: 'Bangkok' },
];

describe('pageSearchTarget', () => {
  it('takes a station to the map with it selected', () => {
    const target = pageSearchTarget(
      { type: 'station', data: { stationId: 'a/b', lat: 18.79, lng: 98.99 } },
      CITIES,
    );

    expect(target).toBe('/?lat=18.79&lng=98.99&zoom=12&sel=station%3Aa%2Fb');
  });

  it('takes a place to the map', () => {
    const target = pageSearchTarget(
      { type: 'place', data: { name: 'Nan, Nan, Thailand', lat: 18.78, lng: 100.78 } },
      CITIES,
    );

    expect(target).toBe('/?lat=18.78&lng=100.78&zoom=11');
  });

  it('takes a place that has a city page to that page', () => {
    const target = pageSearchTarget(
      { type: 'place', data: { name: 'Chiang Mai, Chiang Mai, Thailand', lat: 18.79, lng: 98.98 } },
      CITIES,
    );

    expect(target).toBe('/city/chiang-mai');
  });

  it('does not take a place for a city because its name only contains the city’s', () => {
    const target = pageSearchTarget(
      { type: 'place', data: { name: 'Chiang Mai Zoo, Thailand', lat: 18.8, lng: 98.95 } },
      CITIES,
    );

    expect(target).toBe('/?lat=18.8&lng=98.95&zoom=11');
  });
});
