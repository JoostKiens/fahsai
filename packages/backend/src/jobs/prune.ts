import { supabase } from '../db/client.js';
import { bangkokDateString } from '../utils/bkkDate.js';

// Retention policy: 120-day max scrubber window (MAX_DAYS in the frontend uiStore) + 7-day
// Explain history buffer + timezone/prune-timing buffer, raised to 140 days for DB-size headroom
// (projected burning-season peak ~0.46 GB of the 0.5 GB limit — see
// docs/claude/database.md for the per-table breakdown this is based on).
export const RETENTION_DAYS = 140;
// The hourly tables back the city pages' 24 h value and the backtest of the blend (JOO-140);
// a month is plenty, and an hour per station per day would otherwise dominate the DB.
export const HOURLY_RETENTION_DAYS = 30;

const PRUNE_TARGETS = [
  { key: 'firePointsDeleted', table: 'fire_points', column: 'detected_at', cutoff: 'iso' },
  { key: 'measurementsDeleted', table: 'station_readings', column: 'measured_at', cutoff: 'iso' },
  { key: 'aqGridDeleted', table: 'cams_grid', column: 'date', cutoff: 'date' },
  { key: 'weatherReadingsDeleted', table: 'weather_readings', column: 'date', cutoff: 'date' },
  { key: 'stationWeatherDeleted', table: 'station_weather', column: 'date', cutoff: 'date' },
  {
    key: 'stationFirePressureDeleted',
    table: 'station_fire_pressure',
    column: 'date',
    cutoff: 'date',
  },
  { key: 'camsDailySummaryDeleted', table: 'cams_daily_summary', column: 'date', cutoff: 'date' },
  {
    key: 'stationReadingsHourlyDeleted',
    table: 'station_readings_hourly',
    column: 'measured_at',
    cutoff: 'iso',
    days: HOURLY_RETENTION_DAYS,
  },
  {
    key: 'cityPm25HourlyDeleted',
    table: 'city_pm25_hourly',
    column: 'valid_at',
    cutoff: 'iso',
    days: HOURLY_RETENTION_DAYS,
  },
] as const;

export async function runPrune(): Promise<Record<(typeof PRUNE_TARGETS)[number]['key'], number>> {
  console.log(
    `[prune] Deleting records older than ${RETENTION_DAYS} days (hourly tables: ${HOURLY_RETENTION_DAYS})...`,
  );

  const entries: [(typeof PRUNE_TARGETS)[number]['key'], number][] = [];

  for (const target of PRUNE_TARGETS) {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - ('days' in target ? target.days : RETENTION_DAYS));
    // cams_grid.date and friends are Bangkok calendar days, not UTC — use the BKK day here too.
    const cutoffValue = target.cutoff === 'iso' ? cutoff.toISOString() : bangkokDateString(cutoff);
    const { count, error } = await supabase
      .from(target.table)
      .delete({ count: 'exact' })
      .lt(target.column, cutoffValue);

    if (error) {
      throw new Error(`Failed to prune ${target.table}: ${error.message}`);
    }
    entries.push([target.key, count ?? 0]);
  }

  // Safe to assert here (not at declaration) — every target above either threw
  // or contributed an entry, so entries is guaranteed complete at this point.
  const result = Object.fromEntries(entries) as Record<
    (typeof PRUNE_TARGETS)[number]['key'],
    number
  >;

  console.log(
    `[prune] Deleted ${result.firePointsDeleted} fire_points, ${result.measurementsDeleted} station_readings, ${result.aqGridDeleted} cams_grid, ${result.weatherReadingsDeleted} weather_readings, ${result.stationWeatherDeleted} station_weather, ${result.stationFirePressureDeleted} station_fire_pressure, ${result.camsDailySummaryDeleted} cams_daily_summary, ${result.stationReadingsHourlyDeleted} station_readings_hourly, ${result.cityPm25HourlyDeleted} city_pm25_hourly`,
  );
  return result;
}
