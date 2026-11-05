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
 * read. The figures come from each city's page (the API caches them), one request per city, so a
 * list of a few dozen cities wants the API to send the figure with the list instead.
 */
export async function fetchCityIndex(options: FetchOptions = {}): Promise<CityIndexEntry[] | null> {
  const cities = await fetchCityList(options);
  if (!cities) return null;
  return Promise.all(
    cities.map(async (city) => {
      const result = await fetchCityPage(city.slug, options);
      return { ...city, pm25: result.status === 'ok' ? result.page.pm25 : null };
    }),
  );
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
