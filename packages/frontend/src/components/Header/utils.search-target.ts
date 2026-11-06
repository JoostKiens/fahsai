import type { CityListItem } from '@thailand-aq/types';
import { selParamFromPending } from '@/utils/selectionUrl';

export type SearchTarget = Pick<CityListItem, 'slug' | 'name' | 'country'>;

export type SearchResult =
  | { type: 'station'; data: { stationId: string; lat: number; lng: number } }
  | { type: 'place'; data: { name: string; lat: number; lng: number } };

// How a geocoded place names the country, by ISO code. A place is "City, Region, Country".
// TODO(JOO-101): Thai place names come back in Thai on the Thai pages; match them there too.
const COUNTRY_NAMES: Record<string, string[]> = { TH: ['thailand', 'ประเทศไทย'] };

/**
 * Where a search result goes when the page has no map to move: a station to the map with it
 * selected, a place to the map, and a place that is one of the city pages (same name, same
 * country) to that page.
 */
export function pageSearchTarget(result: SearchResult, cities: SearchTarget[]): string {
  const { lat, lng } = result.data;
  if (result.type === 'station') {
    const sel = selParamFromPending({ kind: 'station', id: result.data.stationId });
    return `/?lat=${lat}&lng=${lng}&zoom=12&sel=${encodeURIComponent(sel ?? '')}`;
  }
  const parts = result.data.name.split(',').map((part) => part.trim().toLowerCase());
  const place = parts[0];
  const country = parts[parts.length - 1];
  const city = cities.find(
    (c) => c.name.toLowerCase() === place && (COUNTRY_NAMES[c.country] ?? []).includes(country),
  );
  return city ? `/city/${city.slug}` : `/?lat=${lat}&lng=${lng}&zoom=11`;
}
