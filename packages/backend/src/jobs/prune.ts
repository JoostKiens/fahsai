import { supabase } from '../db/client.js';

// Retention policy: 90-day max scrubber window + 7-day Explain history buffer
// + timezone/prune-timing buffer, raised to 120 days for DB-size headroom
// (projected burning-season peak ~0.42-0.43 GB of the 0.5 GB limit).
const RETENTION_DAYS = 120;

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
] as const;

export async function runPrune(): Promise<Record<(typeof PRUNE_TARGETS)[number]['key'], number>> {
  console.log(`[prune] Deleting records older than ${RETENTION_DAYS} days...`);

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();
  const cutoffDate = cutoffIso.slice(0, 10); // cams_grid.date and friends are type `date`

  const result = {} as Record<(typeof PRUNE_TARGETS)[number]['key'], number>;

  for (const target of PRUNE_TARGETS) {
    const { count, error } = await supabase
      .from(target.table)
      .delete({ count: 'exact' })
      .lt(target.column, target.cutoff === 'iso' ? cutoffIso : cutoffDate);

    if (error) {
      throw new Error(`Failed to prune ${target.table}: ${error.message}`);
    }
    result[target.key] = count ?? 0;
  }

  console.log(
    `[prune] Deleted ${result.firePointsDeleted} fire_points, ${result.measurementsDeleted} station_readings, ${result.aqGridDeleted} cams_grid, ${result.weatherReadingsDeleted} weather_readings, ${result.stationWeatherDeleted} station_weather, ${result.stationFirePressureDeleted} station_fire_pressure, ${result.camsDailySummaryDeleted} cams_daily_summary`,
  );
  return result;
}
