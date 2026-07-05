import { supabase } from '../db/client.js';
import { fetchAllPages } from './backfill.js';

export const SNAP_LAT_MIN = 1.0;
export const SNAP_LNG_MIN = 89.0;
export const SNAP_STEP = 0.4;
export const WEATHER_STEP = 0.4;
export const WEATHER_LNG_MIN = 89;
export const WEATHER_LAT_MIN = 1;
export const WEATHER_LNG_MAX = 114;
export const WEATHER_LAT_MAX = 30;
export const WEATHER_LNG_COUNT = Math.floor((WEATHER_LNG_MAX - WEATHER_LNG_MIN) / WEATHER_STEP) + 1; // 63
export const WEATHER_LAT_COUNT = Math.floor((WEATHER_LAT_MAX - WEATHER_LAT_MIN) / WEATHER_STEP) + 1; // 73

export function snapToGrid(coord: number, min: number): number {
  return Math.round((min + Math.round((coord - min) / SNAP_STEP) * SNAP_STEP) * 100) / 100;
}

export async function precomputeStationWeather(
  date: string,
  readings: {
    lat: number;
    lng: number;
    wind_speed_kmh: number;
    wind_direction_deg: number;
    precipitation_sum: number | null;
    relative_humidity_2m: number | null;
  }[],
  logPrefix = '[weather-ingest]',
): Promise<number> {
  const PAGE_SIZE = 1000;

  // Fetch coordinates for all known stations — weather is pre-computed regardless of
  // whether a station reported pm25 that day, so History and explain both get weather
  // even on days with missing readings.
  const stations = await fetchAllPages<{ id: string; lat: number; lng: number }>(
    (from, to) =>
      supabase
        .from('stations')
        .select('id, lat, lng')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .range(from, to),
    PAGE_SIZE,
  );

  if (!stations.length) {
    console.warn(`${logPrefix} No station coordinates found for pre-computation`);
    return 0;
  }

  // Build O(1) lookup: key by SNAPPED coords so the map agrees with the station snap,
  // even if a reading's lat/lng has minor float drift.
  const gridMap = new Map<string, (typeof readings)[0]>();
  for (const r of readings) {
    gridMap.set(`${snapToGrid(r.lat, SNAP_LAT_MIN)},${snapToGrid(r.lng, SNAP_LNG_MIN)}`, r);
  }

  const rows: {
    date: string;
    station_id: string;
    wind_speed_kmh: number;
    wind_direction_deg: number;
    precipitation_sum: number | null;
    relative_humidity_2m: number | null;
  }[] = [];

  for (const station of stations) {
    const snappedLat = snapToGrid(station.lat, SNAP_LAT_MIN);
    const snappedLng = snapToGrid(station.lng, SNAP_LNG_MIN);
    const reading = gridMap.get(`${snappedLat},${snappedLng}`);
    if (!reading) continue;
    rows.push({
      date,
      station_id: station.id,
      wind_speed_kmh: reading.wind_speed_kmh,
      wind_direction_deg: reading.wind_direction_deg,
      precipitation_sum: reading.precipitation_sum,
      relative_humidity_2m: reading.relative_humidity_2m,
    });
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error: upsertError } = await supabase
      .from('station_weather')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'station_id,date', ignoreDuplicates: false });
    if (upsertError) {
      throw new Error(`${logPrefix} station_weather upsert failed: ${upsertError.message}`);
    }
  }

  console.log(
    `${logPrefix} Pre-computed weather for ${rows.length}/${stations.length} stations → station_weather`,
  );
  return rows.length;
}
