import { supabase } from '../db/client.js';
import { runStationFirePressure } from '../jobs/station-fire-pressure.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';
import { getYesterdayBkk } from '../utils/bkkDate.js';

const LOG = '[station-fire-pressure-ingest]';

const targetDate = process.argv[2] ?? getYesterdayBkk();

try {
  const { data, error } = await supabase
    .from('stations')
    .select('id, lat, lng')
    .neq('pm25_sensor_ids', '{}');

  if (error) throw new Error(`stations query failed: ${error.message}`);

  const stations = ((data ?? []) as { id: string; lat?: number; lng?: number }[]).filter(
    (s): s is { id: string; lat: number; lng: number } =>
      s.lat !== undefined && s.lat !== null && s.lng !== undefined && s.lng !== null,
  );

  const result = await runStationFirePressure(targetDate, stations);
  console.log(`${LOG} done`, result);
  process.exit(0);
} catch (err) {
  console.error(`${LOG} failed`, err);
  reportError(err);
  await waitForRollbar();
  process.exit(1);
}
