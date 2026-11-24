import type { Station } from '@thailand-aq/types';
import type { CityDef } from '../data/cities.js';
import { haversineKm } from '../utils/geo.js';

export type StationNearCity = Station & { distanceKm: number };

/**
 * The stations that count for a city: those within the radius of its centre, plus the ones it
 * includes, minus the ones it excludes. Nearest first; a tie goes to the lower id.
 */
export function stationsNearCity(
  stations: Station[],
  city: Pick<CityDef, 'lat' | 'lng' | 'radiusKm' | 'include' | 'exclude'>,
): StationNearCity[] {
  const included = new Set(city.include ?? []);
  const excluded = new Set(city.exclude ?? []);
  return stations
    .map((station) => ({
      ...station,
      distanceKm: haversineKm(city.lat, city.lng, station.lat, station.lng),
    }))
    .filter(
      (station) =>
        !excluded.has(station.id) &&
        (station.distanceKm <= city.radiusKm || included.has(station.id)),
    )
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}
