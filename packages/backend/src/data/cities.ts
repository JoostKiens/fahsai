export interface CityDef {
  slug: string;
  name: string;
  /** ISO 3166-1 alpha-2 */
  country: string;
  lat: number;
  lng: number;
  /** The map zoom the "open in map" link uses */
  zoom: number;
  /** Stations to add whatever their distance, by station id */
  include?: string[];
  /** Stations to leave out whatever their distance, by station id */
  exclude?: string[];
}

/** Stations within this distance of a city's centre count for the city. */
export const CITY_RADIUS_KM = 20;

// The pilot. Each has reporting stations within CITY_RADIUS_KM (checked 2026-11-04: Bangkok 83,
// Chiang Mai 17, Lamphun 4, Chiang Rai 3, Lampang 3). Mae Hong Son, Nan and Tak had none that had
// reported in the last 8 days, so a page would be empty.
export const CITIES: readonly CityDef[] = [
  { slug: 'bangkok', name: 'Bangkok', country: 'TH', lat: 13.7563, lng: 100.5018, zoom: 9 },
  { slug: 'chiang-mai', name: 'Chiang Mai', country: 'TH', lat: 18.7883, lng: 98.9853, zoom: 10 },
  { slug: 'chiang-rai', name: 'Chiang Rai', country: 'TH', lat: 19.9105, lng: 99.8325, zoom: 10 },
  { slug: 'lampang', name: 'Lampang', country: 'TH', lat: 18.2888, lng: 99.49, zoom: 10 },
  { slug: 'lamphun', name: 'Lamphun', country: 'TH', lat: 18.5745, lng: 99.0087, zoom: 10 },
];

export function findCity(slug: string): CityDef | undefined {
  return CITIES.find((city) => city.slug === slug);
}
