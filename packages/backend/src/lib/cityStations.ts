import type { Station } from '@thailand-aq/types';
import { CITY_RADIUS_KM, type CityDef } from '../data/cities.js';
import { haversineKm } from '../utils/geo.js';

export type StationNearCity = Station & { distanceKm: number };

/**
 * The stations that count for a city: those within the radius of its centre, plus the ones it
 * includes, minus the ones it excludes. Nearest first; a tie goes to the lower id.
 */
export function stationsNearCity(
  stations: Station[],
  city: Pick<CityDef, 'lat' | 'lng' | 'include' | 'exclude'>,
  radiusKm: number = CITY_RADIUS_KM,
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
        !excluded.has(station.id) && (station.distanceKm <= radiusKm || included.has(station.id)),
    )
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}
