/**
 * Backfill: populates station_weather for all stations for the last N days (default 40).
 * Re-run whenever the station list changes or to fill gaps from missed readings.
 *
 * Usage: pnpm --filter backend run backfill:station-weather [days]
 */
import 'dotenv/config';
import { supabase } from '../db/client.js';

const SNAP_LAT_MIN = 1.0;
const SNAP_LNG_MIN = 89.0;
const SNAP_STEP = 0.4;
const PAGE_SIZE = 1000;

function snapToGrid(coord: number, min: number): number {
  return Math.round((min + Math.round((coord - min) / SNAP_STEP) * SNAP_STEP) * 100) / 100;
}

async function fetchAllPages<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// Pre-fetch all stations with coordinates as a lookup map (id → {lat, lng}).
// Used to resolve lat/lng for each station_id found in station_readings.
const allStations = await fetchAllPages<{ id: string; lat: number; lng: number }>((from, to) =>
  supabase
    .from('stations')
    .select('id, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
    .range(from, to),
);
const stationMap = new Map(allStations.map((s) => [s.id, s]));
console.log(`[backfill] ${stationMap.size} stations with coordinates loaded`);

const rawArg = process.argv.find((a) => /^\d+$/.test(a));
const DAYS = rawArg ? parseInt(rawArg, 10) : 40;
if (isNaN(DAYS) || DAYS < 1) {
  console.error('[backfill] Invalid days argument — must be a positive integer');
  process.exit(1);
}

// Generate dates for the last N days (weather_readings retention window is 100 days).
const dates: string[] = [];
for (let i = DAYS - 1; i >= 0; i--) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - i);
  dates.push(d.toISOString().slice(0, 10));
}
console.log(`[backfill] Will attempt ${dates.length} dates (last ${DAYS} days)`);

let totalRows = 0;
for (const date of dates) {
  // Fetch weather grid for this date.
  let grid: {
    lat: number;
    lng: number;
    wind_speed_kmh: number;
    wind_direction_deg: number;
    precipitation_sum: number | null;
    relative_humidity_2m: number | null;
  }[];
  try {
    grid = await fetchAllPages((from, to) =>
      supabase
        .from('weather_readings')
        .select(
          'lat, lng, wind_speed_kmh, wind_direction_deg, precipitation_sum, relative_humidity_2m',
        )
        .eq('date', date)
        .range(from, to),
    );
  } catch (err) {
    console.warn(
      `[backfill] Skipping ${date} (weather_readings): ${err instanceof Error ? err.message : String(err)}`,
    );
    continue;
  }

  if (!grid.length) {
    console.warn(`[backfill] Skipping ${date}: no grid data`);
    continue;
  }

  // Key by SNAPPED coordinates so historical API-response floats (e.g. 13.7999997)
  // and the snap formula both produce the same map key.
  const gridMap = new Map<string, (typeof grid)[0]>();
  for (const r of grid) {
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

  for (const [stationId, station] of stationMap) {
    const snappedLat = snapToGrid(station.lat, SNAP_LAT_MIN);
    const snappedLng = snapToGrid(station.lng, SNAP_LNG_MIN);
    const reading = gridMap.get(`${snappedLat},${snappedLng}`);
    if (!reading) continue; // station outside weather grid bbox

    rows.push({
      date,
      station_id: stationId,
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
      console.error(`[backfill] Upsert failed for ${date}:`, upsertError.message);
    }
  }

  totalRows += rows.length;
  console.log(
    `[backfill] ${date}: ${rows.length}/${stationMap.size} stations matched weather (grid: ${grid.length} pts)`,
  );
}

console.log(`[backfill] Done — ${totalRows} total rows written to station_weather`);
process.exit(0);
