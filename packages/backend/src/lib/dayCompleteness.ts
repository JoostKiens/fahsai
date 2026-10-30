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
// Throws when a count query fails: a database error must not read as "no data yet".
export async function checkDayCompleteness(date: string): Promise<DayCompleteness> {
  const [camsGrid, stationReadings, weatherReadings] = await Promise.all([
    countRows('cams_grid', supabase.from('cams_grid').select('*', HEAD_COUNT).eq('date', date)),
    countRows(
      'station_readings',
      supabase
        .from('station_readings')
        .select('*', HEAD_COUNT)
        .gte('measured_at', bangkokMidnightIso(date))
        .lt('measured_at', bangkokMidnightIso(offsetDate(date, 1))),
    ),
    countRows(
      'weather_readings',
      supabase.from('weather_readings').select('*', HEAD_COUNT).eq('date', date),
    ),
  ]);

  return {
    isComplete:
      camsGrid >= CAMS_GRID_MIN_ROWS && stationReadings >= 1 && weatherReadings >= WEATHER_MIN_ROWS,
    counts: { camsGrid, stationReadings, weatherReadings },
  };
}

const HEAD_COUNT = { count: 'exact', head: true } as const;

async function countRows(
  table: string,
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}
