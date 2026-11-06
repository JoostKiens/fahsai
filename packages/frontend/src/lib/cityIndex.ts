import type { CityListItem } from '@thailand-aq/types';
import { CITIES_URL, fetchCityPage } from '@/lib/cityPage';
import { fetchCityList } from '@/lib/sitemap';
import { SITE } from '@/lib/site';
import type { FetchOptions } from '@/lib/serverFetch';
import type { i18n } from 'i18next';

export interface CityIndexEntry extends CityListItem {
  /** The city's latest figure; null when no station reported or its page could not be read */
  pm25: number | null;
}

/**
 * The cities with their latest figure, for the list of cities; null when the list itself cannot be
 * read. `complete` is false when a city's page could not be read, so the caller can keep the
 * answer out of the cache. A city with no reading yet is still complete. The figures come from each city's page (the API caches them), one request per city, so a
 * list of a few dozen cities wants the API to send the figure with the list instead.
 */
export async function fetchCityIndex(options: FetchOptions = {}): Promise<{
  cities: CityIndexEntry[];
  complete: boolean;
} | null> {
  const cities = await fetchCityList(options);
  if (!cities) return null;
  const results = await Promise.all(cities.map((city) => fetchCityPage(city.slug, options)));
  return {
    cities: cities.map((city, i) => {
      const result = results[i];
      return { ...city, pm25: result.status === 'ok' ? result.page.pm25 : null };
    }),
    complete: results.every((result) => result.status === 'ok'),
  };
}

/** Structured data for the list of cities: the trail from Fahsai. */
export function cityIndexJsonLd(t: i18n['t']): object[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Fahsai', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: t('city.cities'), item: CITIES_URL },
      ],
    },
  ];
}
