import type { Station } from '@thailand-aq/types';
import { CITY_RADIUS_KM, type CityDef } from '../data/cities.js';
import { supabase } from '../db/client.js';
import { fetchAllPages } from '../utils/backfill.js';
import { stationsNearCity, type StationNearCity } from './cityStations.js';

const PAGE_SIZE = 1000;
const KM_PER_DEGREE_OF_LATITUDE = 111.2;
// a little more than the radius, so the box always holds the circle
const BOX_MARGIN = 1.05;
const STATION_COLUMNS = 'id, name, lat, lng, country, provider';

interface StationRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string | null;
  provider: string | null;
}

/**
 * The stations that count for a city (see stationsNearCity), read from the table with a box around
 * the centre instead of the whole table. A station without coordinates is never one of them.
 */
export async function fetchCityStations(
  city: Pick<CityDef, 'lat' | 'lng' | 'include' | 'exclude'>,
): Promise<StationNearCity[]> {
  const latDelta = (CITY_RADIUS_KM / KM_PER_DEGREE_OF_LATITUDE) * BOX_MARGIN;
  const lngDelta = latDelta / Math.max(Math.cos((city.lat * Math.PI) / 180), 0.1);

  // a comparison drops the rows where the column is null
  const inBox = fetchAllPages<StationRow>(
    (from, to) =>
      supabase
        .from('stations')
        .select(STATION_COLUMNS)
        .gte('lat', city.lat - latDelta)
        .lte('lat', city.lat + latDelta)
        .gte('lng', city.lng - lngDelta)
        .lte('lng', city.lng + lngDelta)
        .order('id')
        .range(from, to),
    PAGE_SIZE,
  );
  const included = city.include?.length
    ? fetchAllPages<StationRow>(
        (from, to) =>
          supabase
            .from('stations')
            .select(STATION_COLUMNS)
            .in('id', city.include ?? [])
            .not('lat', 'is', null)
            .not('lng', 'is', null)
            .order('id')
            .range(from, to),
        PAGE_SIZE,
      )
    : Promise.resolve([]);

  const byId = new Map<string, StationRow>();
  for (const row of [...(await inBox), ...(await included)]) byId.set(row.id, row);
  const stations: Station[] = [...byId.values()].map((row) => ({
    ...row,
    country: row.country ?? '',
  }));
  return stationsNearCity(stations, city);
}
