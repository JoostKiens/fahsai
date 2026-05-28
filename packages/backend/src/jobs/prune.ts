import { supabase } from '../db/client.js';

// Retention policy: 90-day max scrubber window + 7-day Explain history buffer
// + 3-day UTC/prune timing buffer = 100 days.
const RETENTION_DAYS = 100;

export async function runPrune(): Promise<{
  firePointsDeleted: number;
  measurementsDeleted: number;
  aqGridDeleted: number;
  weatherReadingsDeleted: number;
  stationWeatherDeleted: number;
  firePressureScoresDeleted: number;
}> {
  console.log(`[prune] Deleting records older than ${RETENTION_DAYS} days...`);

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();
  const cutoffDate = cutoff.toISOString().slice(0, 10); // cams_grid.date is type `date`

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

  const fpCutoff = new Date();
  fpCutoff.setUTCDate(fpCutoff.getUTCDate() - RETENTION_DAYS);
  const fpCutoffDate = fpCutoff.toISOString().slice(0, 10);

  const { count: firePressureScoresDeleted, error: firePressureError } = await supabase
    .from('fire_pressure_scores')
    .delete({ count: 'exact' })
    .lt('date', fpCutoffDate);

  if (firePressureError) {
    throw new Error(`Failed to prune fire_pressure_scores: ${firePressureError.message}`);
  }

  console.log(
    `[prune] Deleted ${firePointsDeleted ?? 0} fire_points, ${measurementsDeleted ?? 0} station_readings, ${aqGridDeleted ?? 0} cams_grid, ${weatherReadingsDeleted ?? 0} weather_readings, ${stationWeatherDeleted ?? 0} station_weather, ${firePressureScoresDeleted ?? 0} fire_pressure_scores`,
  );
  return {
    firePointsDeleted: firePointsDeleted ?? 0,
    measurementsDeleted: measurementsDeleted ?? 0,
    aqGridDeleted: aqGridDeleted ?? 0,
    weatherReadingsDeleted: weatherReadingsDeleted ?? 0,
    stationWeatherDeleted: stationWeatherDeleted ?? 0,
    firePressureScoresDeleted: firePressureScoresDeleted ?? 0,
  };
}
