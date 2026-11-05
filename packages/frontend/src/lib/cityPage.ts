import {
  BASELINE_DISPLAY_GATE,
  type BaselineResponse,
  type CityPage,
  type CitySentence,
  type CityStationDay,
} from '@thailand-aq/types';
import type { i18n } from 'i18next';
import { apiUrl } from '@/lib/api';
import type { PmBarDay } from '@/components/InfoPanel/PmBarChart';
import { pm25ToCategory } from '@/utils/aqiColors';
import { dateLocale } from '@/utils/locale';

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

/** Structured data for a city page: a breadcrumb, and the page with the place it is about. */
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
      '@type': 'WebPage',
      url,
      name: cityMeta(page).title,
      // the day of the data the page shows (the page itself is rebuilt hourly)
      dateModified: page.date,
      about: {
        '@type': 'Place',
        name: page.name,
        geo: { '@type': 'GeoCoordinates', latitude: page.lat, longitude: page.lng },
      },
    },
  ];
}

/** A day written out, for example 4 Nov 2026. */
export function formatDay(isoDate: string, lang = 'en'): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(dateLocale(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const EARTH_RADIUS_KM = 6371;

function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (to.lat - from.lat) * rad;
  const dLng = (to.lng - from.lng) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.lat * rad) * Math.cos(to.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

export interface ListedStation {
  id: string;
  name: string;
  pm25: number;
  /** From the city centre, to one decimal */
  distanceKm: number;
}

/**
 * The stations behind the city's figure, highest first. A station whose name has no letter or digit
 * (OpenAQ has one called ' ') says nothing to a reader, so it is left out of the list; its readings
 * still count in the figure.
 */
export function listedStations(page: CityPage): ListedStation[] {
  return page.stations
    .filter((s): s is CityStationDay & { pm25: number } => s.pm25 !== null)
    .filter((s) => /[\p{L}\p{N}]/u.test(s.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      pm25: s.pm25,
      distanceKm: Math.round(distanceKm(page, s) * 10) / 10,
    }))
    .sort((a, b) => b.pm25 - a.pm25);
}

export interface BaselineDiff {
  station: string;
  /** How far the station's reading is from the median for the same day in earlier years, in % */
  percent: number;
}

/**
 * The representative station's reading against the median for that day of earlier years. Null when
 * the page has no baseline sentence to give it to (the reading is normal), the station's history
 * is thin (under BASELINE_DISPLAY_GATE years of days), or the API cannot say. Never throws.
 */
export async function fetchBaselineDiff(
  page: CityPage,
  { fetchFn = fetch, timeoutMs = REQUEST_TIMEOUT_MS }: Options = {},
): Promise<BaselineDiff | null> {
  if (!page.drivers?.baselineCategory) return null;
  const station = page.stations.find((s) => s.id === page.drivers?.representativeStationId);
  if (!station || station.pm25 === null) return null;

  const path = `/stations/${encodeURIComponent(station.id)}/baseline`;
  try {
    const res = await fetchFn(apiUrl(path), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`${res.status}`);
    const { data } = (await res.json()) as BaselineResponse;
    const [, month, day] = page.date.split('-').map(Number);
    const typical = data.find((d) => d.month === month && d.day === day);
    if (!typical || typical.n < BASELINE_DISPLAY_GATE || typical.medianPm25 <= 0) return null;
    const percent = Math.round(((station.pm25 - typical.medianPm25) / typical.medianPm25) * 100);
    return { station: station.name, percent };
  } catch (error) {
    console.warn(`[cityPage] ${path} failed, leaving the baseline sentence out:`, error);
    return null;
  }
}

/** The trend as the bar chart takes it: a day nobody reported has no bar, not a bar of 0. */
export function trendDays(page: CityPage): PmBarDay[] {
  return page.trend.map(({ date, pm25, stationCount }) => ({
    date,
    pm25: pm25 ?? 0,
    readingCount: pm25 === null ? 0 : stationCount,
  }));
}

const BASELINE_PREFIX = 'city.summary.baseline.';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The page's summary sentences as HTML, for `set:html`: the day goes in a <time> element, the level
 * sentence gets the AQI category, and the baseline sentences get their station and percentage (or
 * are left out when there is none). Every value the API sent is escaped.
 */
export function summaryHtml(page: CityPage, t: i18n['t'], diff: BaselineDiff | null): string[] {
  return page.summary.flatMap(({ key, params }: CitySentence) => {
    const isBaseline = key.startsWith(BASELINE_PREFIX);
    if (isBaseline && !diff) return [];

    const values: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(params)) {
      values[name] = typeof value === 'string' ? escapeHtml(value) : value;
    }
    if (typeof params.date === 'string') {
      values.date = `<time datetime="${escapeHtml(params.date)}">${escapeHtml(formatDay(params.date))}</time>`;
    }
    if (key === 'city.summary.level' && typeof params.pm25 === 'number') {
      values.category = t(pm25ToCategory(params.pm25).key as never);
    }
    if (isBaseline && diff) {
      values.station = escapeHtml(diff.station);
      values.percent = Math.abs(diff.percent);
    }
    return [t(key as never, values)];
  });
}
