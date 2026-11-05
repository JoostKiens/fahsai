import type { CityListItem } from '@thailand-aq/types';

export type SearchTarget = Pick<CityListItem, 'slug' | 'name'>;

export type SearchResult =
  | { type: 'station'; data: { stationId: string; lat: number; lng: number } }
  | { type: 'place'; data: { name: string; lat: number; lng: number } };

/**
 * Where a search result goes when the page has no map to move: a station to the map with it
 * selected, a place to the map, and a place that is one of the city pages to that page.
 */
export function pageSearchTarget(result: SearchResult, cities: SearchTarget[]): string {
  const { lat, lng } = result.data;
  if (result.type === 'station') {
    return `/?lat=${lat}&lng=${lng}&zoom=12&sel=${encodeURIComponent(`station:${result.data.stationId}`)}`;
  }
  // a place is named "City, Region, Country": only the first part says which city it is
  const place = result.data.name.split(',')[0].trim().toLowerCase();
  const city = cities.find((c) => c.name.toLowerCase() === place);
  return city ? `/city/${city.slug}` : `/?lat=${lat}&lng=${lng}&zoom=11`;
}
