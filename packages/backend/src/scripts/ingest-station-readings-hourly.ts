import { CITIES } from '../data/cities.js';
import { blendHour, supabaseCityBlendSource, supabaseCityHourStore } from '../jobs/city-blend.js';
import { supabaseCityForecastSource, supabaseCityForecastStore } from '../jobs/city-forecast.js';
import { runCityHour } from '../jobs/city-hour.js';
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
  const hour = await runCityHour({
    validAt: blendHour(now),
    cities,
    blendSource: supabaseCityBlendSource,
    blendStore: supabaseCityHourStore,
    forecastSource: supabaseCityForecastSource,
    forecastStore: supabaseCityForecastStore,
  });
  // a failed forecast must not keep the pages from showing the blend: reported here, exit 1 below
  if (hour.forecastError !== null) {
    reportError(hour.forecastError);
    console.error('[city-forecast] failed', hour.forecastError);
  }

  // the pages refresh within the hour anyway, so a failure here is reported, not fatal
  try {
    await refreshCityPages({
      slugs: hour.rows.map((row) => row.city_slug),
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
  process.exit(hour.forecastError === null ? 0 : 1);
} catch (err) {
  reportError(err);
  console.error('[station-readings-hourly] failed', err);
  await waitForRollbar();
  process.exit(1);
}
