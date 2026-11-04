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

// What the day's trajectory and fires say, from the station that stands for the city. The page does
// not depend on it: when it cannot be had, the page goes without.
async function buildDrivers(
  city: CityDef,
  day: ReturnType<typeof cityDay>,
  date: string,
): Promise<CityDrivers | null> {
  const station = pickRepresentativeStation(day.stations, day.pm25);
  if (!station) return null;
  try {
    const [context, camsPm25] = await Promise.all([
      computeScientificContext(station.id, station.lat, station.lng, date),
      fetchCamsNearest(city.lat, city.lng, date),
    ]);
    return context ? driversFromContext(context, station.id, camsPm25) : null;
  } catch (err) {
    logger.warn({ err, slug: city.slug, date }, 'city page: no drivers, the context failed');
    return null;
  }
}

/**
 * The page of one city for the newest complete Bangkok day, or null for a slug that is not in the
 * list. Throws a no_data error when there is no complete day. Cached for an hour.
 */
export async function buildCityPage(slug: string): Promise<CityPage | null> {
  const city = findCity(slug);
  if (!city) return null;

  const date = await getLatestCompleteDate();
  if (date === null)
    throw new AppError({ code: 'no_data', message: 'No complete day of data yet' });

  const cacheKey = `city:v1:${slug}:${date}`;
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
  const [drivers, nearby] = await Promise.all([
    buildDrivers(city, day, date),
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
  void cacheSet(cacheKey, page, { ex: CITY_CACHE_TTL_SECONDS });
  return page;
}
