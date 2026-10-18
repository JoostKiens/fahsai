import { supabase } from '../../db/client.js';

type Row = Record<string, unknown>;

// Children before parents (the station_* tables reference stations). `key` is any non-null
// column: PostgREST refuses a DELETE without a filter.
const TABLES = [
  { name: 'station_readings', key: 'id' },
  { name: 'station_weather', key: 'date' },
  { name: 'station_fire_pressure', key: 'date' },
  { name: 'station_baseline', key: 'month' },
  { name: 'stations', key: 'id' },
  { name: 'fire_points', key: 'id' },
  { name: 'cams_grid', key: 'date' },
  { name: 'weather_readings', key: 'date' },
  { name: 'cams_daily_summary', key: 'date' },
  { name: 'power_plants', key: 'id' },
] as const;

export type TableName = (typeof TABLES)[number]['name'];

const CHUNK_SIZE = 1000;

export async function clearTables(): Promise<void> {
  for (const { name, key } of TABLES) {
    const { error } = await supabase.from(name).delete().not(key, 'is', null);
    if (error) throw new Error(`Failed to clear ${name}: ${error.message}`);
  }
}

// `count` distinct lat/lng pairs, for tables keyed on (date, lat, lng).
export function gridPoints(count: number): { lat: number; lng: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 5 + (i % 100) * 0.1,
    lng: 95 + Math.floor(i / 100) * 0.1,
  }));
}

export async function seed(table: TableName, rows: Row[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK_SIZE));
    if (error) throw new Error(`Failed to seed ${table}: ${error.message}`);
  }
}
