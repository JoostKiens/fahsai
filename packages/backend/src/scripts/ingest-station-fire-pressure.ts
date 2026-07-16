import { MS_PER_DAY } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { runStationFirePressure } from '../jobs/station-fire-pressure.js';
import { bangkokDateString } from '../utils/bkkDate.js';

const LOG = '[station-fire-pressure-ingest]';

const targetDate = process.argv[2] ?? bangkokDateString(Date.now() - MS_PER_DAY);

const { data, error } = await supabase
  .from('stations')
  .select('id, lat, lng')
  .neq('pm25_sensor_ids', '{}');

if (error) {
  console.error(`${LOG} stations query failed:`, error.message);
  process.exit(1);
}

const stations = ((data ?? []) as { id: string; lat?: number; lng?: number }[]).filter(
  (s): s is { id: string; lat: number; lng: number } =>
    s.lat !== undefined && s.lat !== null && s.lng !== undefined && s.lng !== null,
);

try {
  const result = await runStationFirePressure(targetDate, stations);
  console.log(`${LOG} done`, result);
  process.exit(0);
} catch (err) {
  console.error(`${LOG} failed`, err);
  process.exit(1);
}
