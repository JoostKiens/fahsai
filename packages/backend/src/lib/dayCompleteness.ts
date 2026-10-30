import { supabase } from '../db/client.js';
import { bangkokMidnightIso } from '../utils/bkkDate.js';
import { offsetDate } from '../utils/trajectory.js';

const CAMS_GRID_MIN_ROWS = 4000; // full run = 4,599; anything less means the ingest crashed mid-batch
const WEATHER_MIN_ROWS = 4000; // same grid as cams; anything less means the weather ingest hasn't run yet

export type DayCompleteness = {
  isComplete: boolean;
  counts: { camsGrid: number; stationReadings: number; weatherReadings: number };
};

// Whether a Bangkok calendar day has everything the map needs. Shared by /latest-date, which picks
// the newest complete day, and the pipeline-health job, which alerts when yesterday isn't.
// No fires gate: 0 detections is a valid day (rain, cloud cover), and both fires runs
// (10:00, 23:00 UTC) finish before cams/station_readings land at ~23:30 UTC anyway.
export async function checkDayCompleteness(date: string): Promise<DayCompleteness> {
  const [camsResult, readingsResult, weatherResult] = await Promise.all([
    supabase.from('cams_grid').select('*', { count: 'exact', head: true }).eq('date', date),
    supabase
      .from('station_readings')
      .select('*', { count: 'exact', head: true })
      .gte('measured_at', bangkokMidnightIso(date))
      .lt('measured_at', bangkokMidnightIso(offsetDate(date, 1))),
    supabase.from('weather_readings').select('*', { count: 'exact', head: true }).eq('date', date),
  ]);

  const counts = {
    camsGrid: camsResult.count ?? 0,
    stationReadings: readingsResult.count ?? 0,
    weatherReadings: weatherResult.count ?? 0,
  };

  return {
    isComplete:
      counts.camsGrid >= CAMS_GRID_MIN_ROWS &&
      counts.stationReadings >= 1 &&
      counts.weatherReadings >= WEATHER_MIN_ROWS,
    counts,
  };
}
