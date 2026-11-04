import type { CityNearby, CityPage, Station } from '@thailand-aq/types';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { cacheGet, cacheSet } from '../cache/safe.js';
import { supabase } from '../db/client.js';
import { CITIES, findCity, type CityDef } from '../data/cities.js';
import { bangkokDateString, bangkokMidnightIso, bangkokMidnightUtcMs } from '../utils/bkkDate.js';
import { fetchAllPages } from '../utils/backfill.js';
import { haversineKm } from '../utils/geo.js';
import { AppError } from './app-error.js';
import {
  cityDay,
  cityTrend,
  lastDays,
  stationDayMeans,
  whoMultiple,
  type Reading,
} from './cityAggregate.js';
import { stationsNearCity } from './cityStations.js';
import { getLatestCompleteDate } from './latestDate.js';

const PAGE_SIZE = 1000;
// PostgREST takes the ids in the URL, so a long list goes in chunks.
const STATION_ID_CHUNK = 100;
export const TREND_DAYS = 7;
export const NEARBY_MAX_KM = 250;
export const NEARBY_LIMIT = 4;
// The same as the page's ISR: a station that reports late shows up within the hour.
export const CITY_CACHE_TTL_SECONDS = 60 * 60;

interface StationRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string | null;
  provider: string | null;
}

async function fetchStations(): Promise<Station[]> {
  const rows = await fetchAllPages<StationRow>(
    (from, to) =>
      supabase
        .from('stations')
        .select('id, name, lat, lng, country, provider')
        .order('id')
        .range(from, to),
    PAGE_SIZE,
  );
  return rows.map((row) => ({ ...row, country: row.country ?? '' }));
}

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

// Every city's figure for one day, in one query, for the nearby-cities lists.
async function cityMedians(stations: Station[], date: string): Promise<Map<string, number | null>> {
  const stationsByCity = new Map(
    CITIES.map((city) => [city.slug, stationsNearCity(stations, city)]),
  );
  const ids = [...new Set([...stationsByCity.values()].flatMap((near) => near.map((s) => s.id)))];
  const means = stationDayMeans(await fetchReadings(ids, date, date));
  return new Map(
    [...stationsByCity].map(([slug, near]) => [slug, cityDay(near, means, date).pm25]),
  );
}

function nearbyCities(city: CityDef, medians: Map<string, number | null>): CityNearby[] {
  return CITIES.filter((other) => other.slug !== city.slug)
    .map((other) => ({ other, km: haversineKm(city.lat, city.lng, other.lat, other.lng) }))
    .filter(({ km }) => km <= NEARBY_MAX_KM)
    .sort((a, b) => a.km - b.km || a.other.slug.localeCompare(b.other.slug))
    .slice(0, NEARBY_LIMIT)
    .map(({ other }) => ({
      slug: other.slug,
      name: other.name,
      pm25: medians.get(other.slug) ?? null,
    }));
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

  const stations = await fetchStations();
  const near = stationsNearCity(stations, city);
  const dates = lastDays(date, TREND_DAYS);
  const means = stationDayMeans(
    await fetchReadings(
      near.map((station) => station.id),
      dates[0],
      date,
    ),
  );
  const day = cityDay(near, means, date);

  const page: CityPage = {
    slug: city.slug,
    name: city.name,
    country: city.country,
    lat: city.lat,
    lng: city.lng,
    zoom: city.zoom,
    date,
    pm25: day.pm25,
    stationCount: day.stationCount,
    stations: day.stations,
    trend: cityTrend(
      near.map((station) => station.id),
      means,
      dates,
    ),
    // computed in a later step, from the day's trajectory
    drivers: null,
    nearby: nearbyCities(city, await cityMedians(stations, date)),
    whoMultiple: whoMultiple(day.pm25),
  };
  void cacheSet(cacheKey, page, { ex: CITY_CACHE_TTL_SECONDS });
  return page;
}
