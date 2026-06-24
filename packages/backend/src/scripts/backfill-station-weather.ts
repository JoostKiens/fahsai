/**
 * Backfill: populates station_weather for all stations for the last N days (default 40).
 * Re-run whenever the station list changes or to fill gaps from missed readings.
 *
 * Usage: pnpm --filter backend run backfill:station-weather [days]
 */
import 'dotenv/config';
import { supabase } from '../db/client.js';
import { precomputeStationWeather } from '../utils/computeStationWeather.js';
import { fetchAllPages } from '../utils/backfill.js';

const PAGE_SIZE = 1000;

const rawArg = process.argv.find((a) => /^\d+$/.test(a));
const DAYS = rawArg ? parseInt(rawArg, 10) : 40;
if (isNaN(DAYS) || DAYS < 1) {
  console.error('[backfill] Invalid days argument — must be a positive integer');
  process.exit(1);
}

// Generate dates for the last N days (weather_readings retention window is 120 days).
const dates: string[] = [];
for (let i = DAYS - 1; i >= 0; i--) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - i);
  dates.push(d.toISOString().slice(0, 10));
}
console.log(`[backfill] Will attempt ${dates.length} dates (last ${DAYS} days)`);

let totalRows = 0;
for (const date of dates) {
  let grid: {
    lat: number;
    lng: number;
    wind_speed_kmh: number;
    wind_direction_deg: number;
    precipitation_sum: number | null;
    relative_humidity_2m: number | null;
  }[];
  try {
    grid = await fetchAllPages(
      (from, to) =>
        supabase
          .from('weather_readings')
          .select(
            'lat, lng, wind_speed_kmh, wind_direction_deg, precipitation_sum, relative_humidity_2m',
          )
          .eq('date', date)
          .range(from, to),
      PAGE_SIZE,
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

  try {
    totalRows += await precomputeStationWeather(date, grid, '[backfill]');
  } catch (err) {
    console.error(
      `[backfill] Failed for ${date}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

console.log(`[backfill] Done — ${totalRows} total rows written to station_weather`);
process.exit(0);
