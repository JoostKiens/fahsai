import type { CityPage } from '@thailand-aq/types';
import { apiUrl } from '@/lib/api';

const SITE = 'https://fahsai.fyi';
const REQUEST_TIMEOUT_MS = 4000;

export type CityPageResult =
  { status: 'ok'; page: CityPage } | { status: 'not-found' } | { status: 'unavailable' };

interface Options {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The data for a city page. Called while Astro renders, so it never throws: an unknown city is
 * `not-found` (the page answers 404) and anything else that goes wrong is `unavailable` (503).
 */
export async function fetchCityPage(
  slug: string,
  { fetchFn = fetch, timeoutMs = REQUEST_TIMEOUT_MS }: Options = {},
): Promise<CityPageResult> {
  const path = `/cities/${encodeURIComponent(slug)}`;
  try {
    const res = await fetchFn(apiUrl(path), { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 404) return { status: 'not-found' };
    if (!res.ok) throw new Error(`${res.status}`);
    const body = (await res.json()) as unknown;
    if (!isCityPage(body)) throw new Error('unexpected body');
    return { status: 'ok', page: body };
  } catch (error) {
    console.warn(`[cityPage] ${path} failed:`, error);
    return { status: 'unavailable' };
  }
}

function isCityPage(body: unknown): body is CityPage {
  return (
    typeof body === 'object' &&
    body !== null &&
    'slug' in body &&
    typeof body.slug === 'string' &&
    'stations' in body &&
    Array.isArray(body.stations) &&
    'trend' in body &&
    Array.isArray(body.trend)
  );
}

/** A link to the map on this city, on the day the page is about. */
export function cityMapLink({ lat, lng, zoom, date }: CityPage): string {
  return `/?lat=${lat}&lng=${lng}&zoom=${zoom}&date=${date}`;
}

export function cityUrl(slug: string): string {
  return `${SITE}/city/${slug}`;
}

export function cityMeta(page: CityPage) {
  const { name, pm25, date, stationCount } = page;
  const hasReading = pm25 !== null;
  return {
    title: hasReading
      ? `${name} air quality today: PM2.5 ${pm25} µg/m³ | Fahsai`
      : `${name} air quality | Fahsai`,
    description: hasReading
      ? `PM2.5 in ${name} on ${date}: ${pm25} µg/m³, the median of ${stationCount} ground stations. With the 7-day trend, wind and fire detections.`
      : `No ground station in ${name} has reported PM2.5 for ${date} yet.`,
    canonical: cityUrl(page.slug),
    // a page with no figure has nothing to rank for, and would be a thin page in the index
    noindex: !hasReading,
  };
}

/** Structured data for a city page: a breadcrumb and the dataset the figures come from. */
export function cityJsonLd(page: CityPage): object[] {
  const url = cityUrl(page.slug);
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Fahsai', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: page.name, item: url },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Dataset',
      name: `${page.name} daily PM2.5`,
      description: `Daily PM2.5 for ${page.name}: the median of the daily means of the ground stations within 20 km, from OpenAQ.`,
      url,
      isAccessibleForFree: true,
      license: 'https://creativecommons.org/licenses/by/4.0/',
      temporalCoverage: `${page.trend[0]?.date ?? page.date}/${page.date}`,
      spatialCoverage: {
        '@type': 'Place',
        name: page.name,
        geo: { '@type': 'GeoCoordinates', latitude: page.lat, longitude: page.lng },
      },
      variableMeasured: {
        '@type': 'PropertyValue',
        name: 'PM2.5 concentration',
        unitText: 'µg/m³',
      },
    },
  ];
}
