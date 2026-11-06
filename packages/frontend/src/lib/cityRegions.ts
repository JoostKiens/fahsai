// Where each city is, for the list of cities (locales: city.region.<region>). A city nobody has
// placed is listed under "other".
export type CityRegion = 'north' | 'central' | 'other';

const REGIONS: Record<string, CityRegion> = {
  'chiang-mai': 'north',
  'chiang-rai': 'north',
  lampang: 'north',
  lamphun: 'north',
  bangkok: 'central',
};

const ORDER: CityRegion[] = ['north', 'central', 'other'];

export function cityRegion(slug: string): CityRegion {
  return REGIONS[slug] ?? 'other';
}

/** The cities by region in a fixed order, each in the order given; regions with none are left out. */
export function groupByRegion<T extends { slug: string }>(
  cities: T[],
): { region: CityRegion; cities: T[] }[] {
  return ORDER.map((region) => ({
    region,
    cities: cities.filter((city) => cityRegion(city.slug) === region),
  })).filter((group) => group.cities.length > 0);
}
