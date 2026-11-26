import { CITIES } from '../data/cities.js';
import {
  blendHour,
  runCityBlend,
  supabaseCityBlendSource,
  supabaseCityHourStore,
} from '../jobs/city-blend.js';
import {
  runCityForecast,
  supabaseCityForecastSource,
  supabaseCityForecastStore,
} from '../jobs/city-forecast.js';
import {
  fetchFootprintStations,
  runStationReadingsHourlyIngest,
  supabaseHourlyReadingStore,
} from '../jobs/station-readings-hourly.js';
import { fetchCityStations } from '../lib/fetchCityStations.js';
import { refreshCityPages } from '../lib/refreshCityPages.js';
import { reportError, waitForRollbar } from '../lib/rollbar.js';
import { fetchLocationLatestPm25 } from '../utils/openaq.js';

// Above this share of failed locations the hour's station data is too incomplete to trust quietly.
const MAX_FAILED_RATIO = 0.1;

try {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) throw new Error('[station-readings-hourly] OPENAQ_API_KEY env var is required');
  const now = new Date();
  const cities = await Promise.all(
    CITIES.map(async (city) => ({ slug: city.slug, stations: await fetchCityStations(city) })),
  );
  const stations = await fetchFootprintStations(
    cities.flatMap((city) => city.stations.map((s) => s.id)),
  );
  const ingest = await runStationReadingsHourlyIngest({
    now,
    stations,
    fetchLatest: (station) => fetchLocationLatestPm25(apiKey, station.id, station.pm25SensorIds),
    store: supabaseHourlyReadingStore,
  });
  console.log('[station-readings-hourly] done', ingest);

  // Blended even after a bad ingest: a city then leans on CAMS, which beats no value this hour.
  // Stored after the forecast: the stored blend changes the API's page cache key, and a page built
  // between the two writes would be cached for the hour without the forecast.
  const blend = await runCityBlend({
    validAt: blendHour(now),
    cities,
    source: supabaseCityBlendSource,
    store: { upsert: () => Promise.resolve() },
  });
  console.log('[city-blend] done', blend);

  // a failed forecast must not keep the pages from showing the blend: reported here, exit 1 below
  let isForecastFailed = false;
  try {
    const forecast = await runCityForecast({
      blends: blend.rows,
      source: supabaseCityForecastSource,
      store: supabaseCityForecastStore,
    });
    console.log('[city-forecast] done', forecast);
    if (forecast.failed.length > 0) {
      throw new Error(`[city-forecast] CAMS hours not read for ${forecast.failed.join(', ')}`);
    }
  } catch (err) {
    isForecastFailed = true;
    reportError(err);
    console.error('[city-forecast] failed', err);
  }

  if (blend.rows.length > 0) await supabaseCityHourStore.upsert(blend.rows);
  console.log(`[city-blend] stored ${blend.rows.length} cities`);

  // the pages refresh within the hour anyway, so a failure here is reported, not fatal
  try {
    await refreshCityPages({
      slugs: blend.rows.map((row) => row.city_slug),
      bypassToken: process.env.ISR_BYPASS_TOKEN,
    });
  } catch (err) {
    reportError(err);
    console.error('[refresh-city-pages] failed', err);
  }

  // thrown after the writes, so a bad run's partial data is kept
  if (ingest.aborted || ingest.failed > ingest.queried * MAX_FAILED_RATIO) {
    throw new Error(
      `[station-readings-hourly] ${ingest.failed}/${ingest.queried} locations failed` +
        (ingest.aborted ? ', stopped early' : ''),
    );
  }
  await waitForRollbar();
  process.exit(isForecastFailed ? 1 : 0);
} catch (err) {
  reportError(err);
  console.error('[station-readings-hourly] failed', err);
  await waitForRollbar();
  process.exit(1);
}
