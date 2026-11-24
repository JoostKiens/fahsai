import { supabase } from '../db/client.js';

const HOUR_MS = 3_600_000;

/** The city's CAMS PM2.5 for the hour that holds `at`, from the newest stored run; null if none. */
export async function fetchCityCamsAt(slug: string, at: Date): Promise<number | null> {
  const hour = new Date(Math.floor(at.getTime() / HOUR_MS) * HOUR_MS).toISOString();
  const { data, error } = await supabase
    .from('city_cams_hourly')
    .select('pm25')
    .eq('city_slug', slug)
    .eq('valid_at', hour)
    .maybeSingle<{ pm25: number }>();
  if (error) throw new Error(`city_cams_hourly: ${error.message}`);
  return data?.pm25 ?? null;
}

/** When the newest stored run was made; null when the table is empty. */
export async function fetchNewestCityCamsRun(): Promise<Date | null> {
  const { data, error } = await supabase
    .from('city_cams_hourly')
    .select('run_at')
    .order('run_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ run_at: string }>();
  if (error) throw new Error(`city_cams_hourly: ${error.message}`);
  return data === null ? null : new Date(data.run_at);
}
