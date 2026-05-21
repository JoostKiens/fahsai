import { supabase } from '../db/client.js';

// Retention policy (all dates in BKK / ICT, UTC+7):
//
//   31 days — scrubber shows T-1 (yesterday) through T-30 (30 days back),
//             plus T+0 (today) which is ingested by cron but not yet visible
//   +7 days — Explain fetches a 7-day measurement history anchored to the
//             selected date; on scrubber day 0 (T-30) that reaches back to T-37
//   +2 days — buffer for UTC+7 timezone boundary and prune job timing
//   = 40 days
// Increased to 130 to back a planned 120-day scrubber window (120 days + 7-day Explain
// history buffer + 2-day UTC/prune timing buffer). Also preserves the full fire season
// (Feb–April) for the Explain feature. ~260 MB on Supabase free tier (500 MB limit).
const RETENTION_DAYS = 130;

export async function runPrune(): Promise<{
  firePointsDeleted: number;
  measurementsDeleted: number;
  aqGridDeleted: number;
  weatherReadingsDeleted: number;
  stationWeatherDeleted: number;
}> {
  console.log(`[prune] Deleting records older than ${RETENTION_DAYS} days...`);

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();
  const cutoffDate = cutoff.toISOString().slice(0, 10); // aq_grid.date is type `date`

  const { count: firePointsDeleted, error: fireError } = await supabase
    .from('fire_points')
    .delete({ count: 'exact' })
    .lt('detected_at', cutoffIso);

  if (fireError) {
    throw new Error(`Failed to prune fire_points: ${fireError.message}`);
  }

  const { count: measurementsDeleted, error: measurementsError } = await supabase
    .from('station_readings')
    .delete({ count: 'exact' })
    .lt('measured_at', cutoffIso);

  if (measurementsError) {
    throw new Error(`Failed to prune measurements: ${measurementsError.message}`);
  }

  const { count: aqGridDeleted, error: aqGridError } = await supabase
    .from('cams_grid')
    .delete({ count: 'exact' })
    .lt('date', cutoffDate);

  if (aqGridError) {
    throw new Error(`Failed to prune cams_grid: ${aqGridError.message}`);
  }

  const { count: weatherReadingsDeleted, error: weatherError } = await supabase
    .from('weather_readings')
    .delete({ count: 'exact' })
    .lt('date', cutoffDate);

  if (weatherError) {
    throw new Error(`Failed to prune weather_readings: ${weatherError.message}`);
  }

  const { count: stationWeatherDeleted, error: stationWeatherError } = await supabase
    .from('station_weather')
    .delete({ count: 'exact' })
    .lt('date', cutoffDate);

  if (stationWeatherError) {
    throw new Error(`Failed to prune station_weather: ${stationWeatherError.message}`);
  }

  console.log(
    `[prune] Deleted ${firePointsDeleted ?? 0} fire_points, ${measurementsDeleted ?? 0} station_readings, ${aqGridDeleted ?? 0} cams_grid, ${weatherReadingsDeleted ?? 0} weather_readings, ${stationWeatherDeleted ?? 0} station_weather`,
  );
  return {
    firePointsDeleted: firePointsDeleted ?? 0,
    measurementsDeleted: measurementsDeleted ?? 0,
    aqGridDeleted: aqGridDeleted ?? 0,
    weatherReadingsDeleted: weatherReadingsDeleted ?? 0,
    stationWeatherDeleted: stationWeatherDeleted ?? 0,
  };
}
