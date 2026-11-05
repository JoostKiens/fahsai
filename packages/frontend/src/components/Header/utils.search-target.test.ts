import { describe, it, expect } from 'vitest';
import { parsePendingSelection } from '@/utils/selectionUrl';
import { pageSearchTarget } from './utils.search-target';

const CITIES = [
  { slug: 'chiang-mai', name: 'Chiang Mai', country: 'TH' },
  { slug: 'bangkok', name: 'Bangkok', country: 'TH' },
];

function station(stationId: string) {
  return { type: 'station' as const, data: { stationId, lat: 18.79, lng: 98.99 } };
}

describe('pageSearchTarget', () => {
  it('takes a station to the map with it selected', () => {
    expect(pageSearchTarget(station('6160761'), CITIES)).toBe(
      '/?lat=18.79&lng=98.99&zoom=12&sel=station%3A6160761',
    );
  });

  // the map writes and reads `sel` its own way (selectionUrl.ts); the id must come out the same
  it.each(['6160761', 'a/b', '100%', 'x y&z=1', 'ไทย'])(
    'writes station id %j the way the map reads it',
    (id) => {
      const url = new URL(pageSearchTarget(station(id), CITIES), 'https://fahsai.fyi');

      expect(parsePendingSelection(url.searchParams.get('sel'))).toEqual({ kind: 'station', id });
    },
  );

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

  it('does not take a place in another country for the city of the same name', () => {
    const target = pageSearchTarget(
      { type: 'place', data: { name: 'Bangkok, Somewhere, Laos', lat: 17.9, lng: 102.6 } },
      CITIES,
    );

    expect(target).toBe('/?lat=17.9&lng=102.6&zoom=11');
  });
});
