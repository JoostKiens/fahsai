import type { CityDrivers, CityNearby, CityPage } from '@thailand-aq/types';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { cacheGet, cacheSet } from '../cache/safe.js';
import { logger } from './logger.js';
import { supabase } from '../db/client.js';
import { CITIES, findCity, type CityDef } from '../data/cities.js';
import { bangkokDateString, bangkokMidnightIso, bangkokMidnightUtcMs } from '../utils/bkkDate.js';
import { fetchAllPages } from '../utils/backfill.js';
import { haversineKm } from '../utils/geo.js';
import { AppError } from './app-error.js';
import { fetchCamsNearest } from './camsNearest.js';
import { computeScientificContext } from './computeScientificContext.js';
import { driversFromContext, pickRepresentativeStation } from './cityDrivers.js';
import {
  cityDay,
  cityTrend,
  lastDays,
  stationDayMeans,
  whoMultiple,
  type Reading,
} from './cityAggregate.js';
import { citySummary } from './citySummary.js';
import { fetchCityStations } from './fetchCityStations.js';
import { getLatestCompleteDate } from './latestDate.js';

const PAGE_SIZE = 1000;
// PostgREST takes the ids in the URL, so a long list goes in chunks.
const STATION_ID_CHUNK = 100;
export const TREND_DAYS = 7;
export const NEARBY_MAX_KM = 250;
export const NEARBY_LIMIT = 4;
// The same as the page's ISR: a station that reports late shows up within the hour.
export const CITY_CACHE_TTL_SECONDS = 60 * 60;

interface ReadingRow {
  station_id: string;
  value: number;
  measured_at: string;
}

// The readings of these stations on the Bangkok days from `fromDate` to `toDate`, both included.
async function fetchReadings(
  stationIds: string[],
  fromDate: string,
  toDate: string,
): Promise<Reading[]> {
  const from = bangkokMidnightIso(fromDate);
  const until = bangkokMidnightIso(bangkokDateString(bangkokMidnightUtcMs(toDate) + MS_PER_DAY));
  const readings: Reading[] = [];
  for (let i = 0; i < stationIds.length; i += STATION_ID_CHUNK) {
    const ids = stationIds.slice(i, i + STATION_ID_CHUNK);
    const rows = await fetchAllPages<ReadingRow>(
      (rangeFrom, rangeTo) =>
        supabase
          .from('station_readings')
          .select('station_id, value, measured_at')
          .in('station_id', ids)
          .gte('measured_at', from)
          .lt('measured_at', until)
          .order('id')
          .range(rangeFrom, rangeTo),
      PAGE_SIZE,
    );
    readings.push(
      ...rows.map((row) => ({
        stationId: row.station_id,
        measuredAt: row.measured_at,
        value: row.value,
      })),
    );
  }
  return readings;
}

// The cities the page links to: the nearest few within reach, nearest first.
function nearbyCandidates(city: CityDef): CityDef[] {
  return CITIES.filter((other) => other.slug !== city.slug)
    .map((other) => ({ other, km: haversineKm(city.lat, city.lng, other.lat, other.lng) }))
    .filter(({ km }) => km <= NEARBY_MAX_KM)
    .sort((a, b) => a.km - b.km || a.other.slug.localeCompare(b.other.slug))
    .slice(0, NEARBY_LIMIT)
    .map(({ other }) => other);
}

// The candidates' figures for one day, from one readings query.
async function nearbyCities(candidates: CityDef[], date: string): Promise<CityNearby[]> {
  if (candidates.length === 0) return [];
  const stationsByCity = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      near: await fetchCityStations(candidate),
    })),
  );
  const ids = [...new Set(stationsByCity.flatMap(({ near }) => near.map((station) => station.id)))];
  const means = stationDayMeans(await fetchReadings(ids, date, date));
  return stationsByCity.map(({ candidate, near }) => ({
    slug: candidate.slug,
    name: candidate.name,
    pm25: cityDay(near, means, date).pm25,
  }));
}

// The context is the heaviest part of a page (a peer query over all stations, three wind and three
// CAMS grids, a fire query), and the page does not depend on it: past this the page goes without.
const DRIVERS_DEADLINE_MS = 6000;
// A page that lacks something a failure kept from it is kept for a minute, not the hour.
const DEGRADED_CACHE_TTL_SECONDS = 60;

export interface BuildCityPageOptions {
  driversDeadlineMs?: number;
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`took longer than ${ms} ms`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// What the day's trajectory and fires say, from the station that stands for the city. `complete` is
// false when something could not be read (the context, the CAMS value or the fire data), as opposed
// to there being nothing to say.
async function buildDrivers(
  city: CityDef,
  day: ReturnType<typeof cityDay>,
  date: string,
  deadlineMs: number,
): Promise<{ drivers: CityDrivers | null; complete: boolean }> {
  const station = pickRepresentativeStation(day.stations, day.pm25);
  if (!station) return { drivers: null, complete: true };

  const [context, cams] = await Promise.allSettled([
    withDeadline(computeScientificContext(station.id, station.lat, station.lng, date), deadlineMs),
    fetchCamsNearest(city.lat, city.lng, date),
  ]);
  if (cams.status === 'rejected') {
    logger.warn({ err: cams.reason, slug: city.slug, date }, 'city page: no CAMS value');
  }
  if (context.status === 'rejected') {
    logger.warn({ err: context.reason, slug: city.slug, date }, 'city page: no drivers');
    return { drivers: null, complete: false };
  }
  if (context.value === null) return { drivers: null, complete: true };

  const fireDataMissing = context.value.transport?.fire.dataAvailable === false;
  return {
    drivers: driversFromContext(
      context.value,
      station.id,
      cams.status === 'fulfilled' ? cams.value : null,
    ),
    complete: cams.status === 'fulfilled' && !fireDataMissing,
  };
}

// Requests that arrive together for the same page share one build (per process).
const inFlight = new Map<string, Promise<CityPage>>();

/**
 * The page of one city for the newest complete Bangkok day, or null for a slug that is not in the
 * list. Throws a no_data error when there is no complete day. Cached for an hour, or a minute when
 * part of it could not be read.
 */
export async function buildCityPage(
  slug: string,
  { driversDeadlineMs = DRIVERS_DEADLINE_MS }: BuildCityPageOptions = {},
): Promise<CityPage | null> {
  const city = findCity(slug);
  if (!city) return null;

  const date = await getLatestCompleteDate();
  if (date === null)
    throw new AppError({ code: 'no_data', message: 'No complete day of data yet' });

  const cacheKey = `city:v1:${slug}:${date}`;
  const running = inFlight.get(cacheKey);
  if (running) return running;

  const build = (async (): Promise<CityPage> => {
    const cached = await cacheGet<CityPage>(cacheKey);
    if (cached) return cached;

    const near = await fetchCityStations(city);
    const dates = lastDays(date, TREND_DAYS);
    const means = stationDayMeans(
      await fetchReadings(
        near.map((station) => station.id),
        dates[0],
        date,
      ),
    );
    const day = cityDay(near, means, date);
    // neither needs the other
    const [{ drivers, complete }, nearby] = await Promise.all([
      buildDrivers(city, day, date, driversDeadlineMs),
      nearbyCities(nearbyCandidates(city), date),
    ]);
    const headline = {
      name: city.name,
      date,
      pm25: day.pm25,
      stationCount: day.stationCount,
      whoMultiple: whoMultiple(day.pm25),
      drivers,
    };

    const page: CityPage = {
      slug: city.slug,
      name: city.name,
      country: city.country,
      lat: city.lat,
      lng: city.lng,
      zoom: city.zoom,
      date,
      pm25: headline.pm25,
      stationCount: headline.stationCount,
      stations: day.stations,
      trend: cityTrend(
        near.map((station) => station.id),
        means,
        dates,
      ),
      drivers,
      summary: citySummary(headline),
      nearby,
      whoMultiple: headline.whoMultiple,
    };
    void cacheSet(cacheKey, page, {
      ex: complete ? CITY_CACHE_TTL_SECONDS : DEGRADED_CACHE_TTL_SECONDS,
    });
    return page;
  })().finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, build);
  return build;
}
