/**
 * Diagnostic: reports min/max date and row count for all time-series tables.
 * Run once to determine backfill range needed.
 * Usage: pnpm --filter backend run check-data-ranges
 */
import { supabase } from '../db/client.js';

async function minMax(
  table: string,
  col: string,
): Promise<{ min: string | null; max: string | null; count: number }> {
  const { data, error } = await supabase
    .from(table)
    .select(`${col}`)
    .order(col, { ascending: true })
    .limit(1);
  if (error) throw new Error(`${table} min: ${error.message}`);
  const min = (data?.[0] as unknown as Record<string, unknown> | undefined)?.[col] ?? null;

  const { data: data2, error: error2 } = await supabase
    .from(table)
    .select(`${col}`)
    .order(col, { ascending: false })
    .limit(1);
  if (error2) throw new Error(`${table} max: ${error2.message}`);
  const max = (data2?.[0] as unknown as Record<string, unknown> | undefined)?.[col] ?? null;

  const { count, error: error3 } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error3) throw new Error(`${table} count: ${error3.message}`);

  return {
    min: typeof min === 'string' ? min.slice(0, 10) : null,
    max: typeof max === 'string' ? max.slice(0, 10) : null,
    count: count ?? 0,
  };
}

const tables: Array<{ name: string; col: string }> = [
  { name: 'fire_points', col: 'detected_at' },
  { name: 'station_readings', col: 'measured_at' },
  { name: 'weather_readings', col: 'date' },
  { name: 'cams_grid', col: 'date' },
  { name: 'station_weather', col: 'date' },
  { name: 'station_fire_pressure', col: 'date' },
];

console.log('\nTable                  Min date     Max date     Rows');
console.log('─'.repeat(60));

for (const { name, col } of tables) {
  try {
    const { min, max, count } = await minMax(name, col);
    const pad = (s: string) => s.padEnd(22);
    console.log(
      `${pad(name)} ${min ?? 'n/a'.padEnd(10)}   ${max ?? 'n/a'.padEnd(10)}   ${count.toLocaleString()}`,
    );
  } catch (err) {
    console.error(`  ${name}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log('');
process.exit(0);
