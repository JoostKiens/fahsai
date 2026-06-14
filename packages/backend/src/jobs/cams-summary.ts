import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';

// 95th percentile of PM2.5 across a day's CAMS grid. The grid spans land, sea, and
// clean cells, so a spatial mean washes out smoke plumes; p95 reflects how bad the
// worst-affected areas got, keeping burning-season days vivid on the scrubber chart.
export function computeP95(values: number[]): number {
  if (values.length === 0) throw new Error('[cams-summary] computeP95 called with no values');
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  const clamped = Math.min(Math.max(index, 0), sorted.length - 1);
  return sorted[clamped];
}

export async function upsertCamsDailySummary(
  date: string,
  p95: number,
  pointCount: number,
): Promise<void> {
  await pRetry(
    async () => {
      const { error } = await supabase
        .from('cams_daily_summary')
        .upsert({ date, pm25_p95: p95, point_count: pointCount }, { onConflict: 'date' });
      if (error) throw new AbortError(`[cams-summary] upsert failed for ${date}: ${error.message}`);
    },
    { retries: 3, minTimeout: 1000, factor: 2 },
  );
}
