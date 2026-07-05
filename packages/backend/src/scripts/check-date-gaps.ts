/**
 * Diagnostic: samples every 7 days to find gaps in derived tables.
 * Usage: pnpm --filter backend run check-date-gaps
 */
import { MS_PER_DAY } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';

const tables: Array<{ name: string; col: string; start: string; end: string }> = [
  { name: 'weather_readings', col: 'date', start: '2026-02-16', end: '2026-05-26' },
  { name: 'station_weather', col: 'date', start: '2026-02-16', end: '2026-05-26' },
  { name: 'station_fire_pressure', col: 'date', start: '2026-02-14', end: '2026-05-26' },
];

for (const { name, col, start, end } of tables) {
  const startMs = new Date(start + 'T00:00:00Z').getTime();
  const endMs = new Date(end + 'T00:00:00Z').getTime();
  const totalDays = Math.round((endMs - startMs) / MS_PER_DAY) + 1;
  const emptyDates: string[] = [];

  let cursor = startMs;
  while (cursor <= endMs) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    const { count } = await supabase
      .from(name)
      .select('*', { count: 'exact', head: true })
      .eq(col, date);
    if ((count ?? 0) === 0) emptyDates.push(date);
    cursor += MS_PER_DAY; // daily
  }

  const gapSummary = emptyDates.length === 0 ? 'none found' : emptyDates.join(', ');
  console.log(`${name}: ${totalDays} days in range | gaps (weekly sample): ${gapSummary}`);
}

process.exit(0);
