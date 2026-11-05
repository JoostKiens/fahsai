import {
  BASELINE_DISPLAY_GATE,
  type BaselineResponse,
  type CityPage,
  type CitySentence,
  type CityStationDay,
} from '@thailand-aq/types';
import type { i18n } from 'i18next';
import { SITE } from '@/lib/site';
import { fetchApi, type FetchOptions } from '@/lib/serverFetch';
import type { PmBarDay } from '@/components/InfoPanel/PmBarChart';
import { pm25ToCategory } from '@/utils/aqiColors';
import { dateLocale } from '@/utils/locale';

// the baseline sentence is optional: a slow answer must not hold the page up for long
const BASELINE_TIMEOUT_MS = 1500;

export type CityPageResult =
  { status: 'ok'; page: CityPage } | { status: 'not-found' } | { status: 'unavailable' };

/**
 * The data for a city page. Called while Astro renders, so it never throws: an unknown city is
 * `not-found` (the page answers 404) and anything else that goes wrong is `unavailable` (503).
 */
export async function fetchCityPage(
  slug: string,
  options: FetchOptions = {},
): Promise<CityPageResult> {
  const answer = await fetchApi(`/cities/${encodeURIComponent(slug)}`, options);
  if (answer?.status === 404) return { status: 'not-found' };
  if (!answer?.ok) return { status: 'unavailable' };
  if (!isCityPage(answer.body)) {
    console.warn('[cityPage] the API sent something that is not a city page');
    return { status: 'unavailable' };
  }
  return { status: 'ok', page: answer.body };
}

// Everything the page reads, so a partial or changed answer is `unavailable` and not a crash
function isCityPage(body: unknown): body is CityPage {
  if (typeof body !== 'object' || body === null) return false;
  const page = body as Record<string, unknown>;
  const isNumberOrNull = (value: unknown) => value === null || typeof value === 'number';
  return (
    typeof page.slug === 'string' &&
    typeof page.name === 'string' &&
    typeof page.date === 'string' &&
    typeof page.lat === 'number' &&
    typeof page.lng === 'number' &&
    typeof page.zoom === 'number' &&
    typeof page.stationCount === 'number' &&
    isNumberOrNull(page.pm25) &&
    isNumberOrNull(page.whoMultiple) &&
    Array.isArray(page.stations) &&
    Array.isArray(page.trend) &&
    Array.isArray(page.summary) &&
    Array.isArray(page.nearby) &&
    (page.drivers === null || (typeof page.drivers === 'object' && page.drivers !== undefined))
  );
}

/** A link to the map on this city, on the day the page is about. */
export function cityMapLink({ lat, lng, zoom, date }: CityPage): string {
  return `/?lat=${lat}&lng=${lng}&zoom=${zoom}&date=${date}`;
}

export function cityUrl(slug: string): string {
  return `${SITE}/city/${slug}`;
}

/**
 * The head tags of a city page. No "today": the figure is the newest complete day, which for part
 * of every day is yesterday, so the title and description say which day it is.
 */
export function cityMeta(page: CityPage, t: i18n['t']) {
  const { name, pm25, date, stationCount } = page;
  return {
    title:
      pm25 === null
        ? t('city.metaTitleNoData', { name })
        : t('city.metaTitle', { name, pm25, date }),
    description:
      pm25 === null
        ? t('city.metaDescriptionNoData', { name, date })
        : t('city.metaDescription', { name, pm25, date, count: stationCount }),
    canonical: cityUrl(page.slug),
  };
}

/** Structured data for a city page: a breadcrumb, and the page with the place it is about. */
export function cityJsonLd(page: CityPage, title: string): object[] {
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
      name: title,
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

// OpenAQ has a station called ' ': no letter or digit says nothing to a reader
function isReadableName(name: string): boolean {
  return /[\p{L}\p{N}]/u.test(name);
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
    .filter((s) => isReadableName(s.name))
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
  { timeoutMs = BASELINE_TIMEOUT_MS, ...options }: FetchOptions = {},
): Promise<BaselineDiff | null> {
  if (!page.drivers?.baselineCategory) return null;
  const station = page.stations.find((s) => s.id === page.drivers?.representativeStationId);
  // a station the list leaves out for its name cannot be named in a sentence either
  if (!station || station.pm25 === null || !isReadableName(station.name)) return null;

  const answer = await fetchApi(`/stations/${encodeURIComponent(station.id)}/baseline`, {
    ...options,
    timeoutMs,
  });
  const data = (answer?.body as BaselineResponse | null)?.data;
  if (!answer?.ok || !Array.isArray(data)) return null;

  const [, month, day] = page.date.split('-').map(Number);
  const typical = data.find((d) => d.month === month && d.day === day);
  if (!typical || typical.n < BASELINE_DISPLAY_GATE || typical.medianPm25 <= 0) return null;
  const percent = Math.round(((station.pm25 - typical.medianPm25) / typical.medianPm25) * 100);
  return { station: station.name, percent };
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
// a key is plain words and dots; anything else is not one of ours and is not put in the page
const PLAIN_KEY = /^[A-Za-z][\w.]*$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The API chose the wording (above or below) from its own comparison; the percentage is worked out
// here. Where the two disagree, or the percentage is 0, the sentence is left out rather than say
// the opposite of the figure.
function agreesWithKey(key: string, diff: BaselineDiff | null): diff is BaselineDiff {
  if (!diff || diff.percent === 0) return false;
  const isAbove = /[Aa]bove$/.test(key);
  return isAbove ? diff.percent > 0 : diff.percent < 0;
}

/**
 * The page's summary sentences as HTML, for `set:html`: the day goes in a <time> element, the level
 * sentence gets the AQI category, and the baseline sentences get their station and percentage (or
 * are left out when there is none). Every value the API sent is escaped.
 */
export function summaryHtml(page: CityPage, t: i18n['t'], diff: BaselineDiff | null): string[] {
  return page.summary.flatMap(({ key, params }: CitySentence) => {
    if (!PLAIN_KEY.test(key)) return [];
    const isBaseline = key.startsWith(BASELINE_PREFIX);
    if (isBaseline && !agreesWithKey(key, diff)) return [];

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
