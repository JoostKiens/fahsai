import { CITIES } from '../data/cities.js';
import {
  fetchFootprintStations,
  runStationReadingsHourlyIngest,
  supabaseHourlyReadingStore,
} from '../jobs/station-readings-hourly.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';
import { fetchLocationLatestPm25 } from '../utils/openaq.js';

// Above this share of failed locations the hour's station data is too incomplete to trust quietly.
const MAX_FAILED_RATIO = 0.1;

try {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) throw new Error('[station-readings-hourly] OPENAQ_API_KEY env var is required');
  const stations = await fetchFootprintStations(CITIES);
  const result = await runStationReadingsHourlyIngest({
    now: new Date(),
    stations,
    fetchLatest: (station) => fetchLocationLatestPm25(apiKey, station.id, station.pm25SensorIds),
    store: supabaseHourlyReadingStore,
  });
  console.log('[station-readings-hourly] done', result);
  // thrown after the writes, so a bad run's partial data is kept
  if (result.aborted || result.failed > result.queried * MAX_FAILED_RATIO) {
    throw new Error(
      `[station-readings-hourly] ${result.failed}/${result.queried} locations failed` +
        (result.aborted ? ', stopped early' : ''),
    );
  }
  await waitForRollbar();
  process.exit(0);
} catch (err) {
  reportError(err);
  console.error('[station-readings-hourly] failed', err);
  await waitForRollbar();
  process.exit(1);
}
