/**
 * JOO-122 backtest: how well would a bias-corrected CAMS value have predicted a northern city's
 * measured PM2.5 band? Prints markdown tables to paste into docs/experiments/.
 *
 * Usage:
 *   pnpm --filter backend run backtest:forecast -- --start=2026-02-01 --end=2026-04-30
 *
 * PROXY: Open-Meteo archives no day-ahead PM2.5 forecasts (pm2_5_previous_day1 is null), so
 * CAMS(D) here is the archived model series for day D, which tracks reality more closely than a
 * real forecast made the day before. Results are an upper bound on forecast skill.
 *
 * Station readings come from the OpenAQ S3 archive, not the database: the haze season is older
 * than the 140-day retention (jobs/prune.ts). Station metadata still comes from `stations`.
 */
import pRetry from 'p-retry';
import { AQ_LAT_MIN, AQ_LNG_MIN, AQ_STEP } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { CITIES, type CityDef } from '../data/cities.js';
import { fetchCityStations } from '../lib/fetchCityStations.js';
import { cityDay, stationDayMeans, type Reading } from '../lib/cityAggregate.js';
import {
  DEFAULT_CLAMP,
  evaluate,
  type BacktestResult,
  type DayPair,
  type Method,
} from '../lib/forecastBacktest.js';
import { buildS3Url, computeDailyMean, downloadS3File } from '../utils/openaq-s3.js';
import { fetchAllPages, parseDateFlag, runWithConcurrency } from '../utils/backfill.js';
import { offsetDate } from '../utils/trajectory.js';

const LABEL = '[backtest-forecast]';
const S3_CONCURRENCY = 20;
const MIN_STATIONS_PER_CITY = 2;
const MIN_HOURLY_VALUES_PER_DAY = 20;
const WIDE_CLAMP = { min: 1 / 3, max: 3 };

const METHOD_LABELS: Record<Method, string> = {
  raw: 'Raw CAMS',
  corrected: 'Corrected',
  correctedSafe: 'Corrected + safety rule',
  persistence: 'Persistence (yesterday’s figure)',
};

// Northern cities not (yet) in data/cities.ts. Kept only if they have enough stations nearby.
const EXTRA_NORTHERN_CITIES: CityDef[] = [
  { slug: 'phayao', name: 'Phayao', country: 'TH', lat: 19.1664, lng: 99.9019, zoom: 10 },
  { slug: 'nan', name: 'Nan', country: 'TH', lat: 18.7756, lng: 100.773, zoom: 10 },
  { slug: 'phrae', name: 'Phrae', country: 'TH', lat: 18.1459, lng: 100.141, zoom: 10 },
  {
    slug: 'mae-hong-son',
    name: 'Mae Hong Son',
    country: 'TH',
    lat: 19.302,
    lng: 97.9654,
    zoom: 10,
  },
  {
    slug: 'phitsanulok',
    name: 'Phitsanulok',
    country: 'TH',
    lat: 16.8211,
    lng: 100.2659,
    zoom: 10,
  },
];

const startDate = parseDateFlag('start', LABEL);
const endDate = parseDateFlag('end', LABEL);
if (startDate > endDate) {
  console.error(`${LABEL} --start (${startDate}) must be ≤ --end (${endDate})`);
  process.exit(1);
}
// One day before the start, so the first day has a "yesterday" to correct with.
const firstFetchDate = offsetDate(startDate, -1);
const dates = datesBetween(firstFetchDate, endDate);

const northernCities = [
  ...CITIES.filter((city) => city.slug !== 'bangkok'),
  ...EXTRA_NORTHERN_CITIES,
];

type CityRun = { city: CityDef; stationCount: number; pairs: DayPair[] };
const runs: CityRun[] = [];
const skipped: string[] = [];

for (const city of northernCities) {
  const stations = await fetchCityStations(city);
  if (stations.length < MIN_STATIONS_PER_CITY) {
    skipped.push(`${city.name} (${stations.length} station${stations.length === 1 ? '' : 's'})`);
    continue;
  }
  console.error(`${LABEL} ${city.name}: ${stations.length} stations, ${dates.length} days`);

  const sensorIds = await fetchSensorIds(stations.map((station) => station.id));
  const readings = await fetchReadings({ stationIds: stations.map((s) => s.id), sensorIds });
  const means = stationDayMeans(readings);
  const cams = await fetchCamsDailyMeans({ city });

  const pairs: DayPair[] = [];
  for (const date of dates.slice(1)) {
    const prev = offsetDate(date, -1);
    const measured = cityDay(stations, means, date).pm25;
    const measuredPrev = cityDay(stations, means, prev).pm25;
    const camsToday = cams.get(date);
    const camsPrev = cams.get(prev);
    if (
      measured === null ||
      measuredPrev === null ||
      camsToday === undefined ||
      camsPrev === undefined
    ) {
      continue;
    }
    pairs.push({ date, measured, measuredPrev, camsToday, camsPrev });
  }
  runs.push({ city, stationCount: stations.length, pairs });
}

printReport();
process.exit(0);

function printReport(): void {
  console.log(
    `# Backtest ${startDate} → ${endDate} (proxy: archived CAMS, not a true day-ahead)\n`,
  );
  console.log(
    `Clamp ${DEFAULT_CLAMP.min}–${DEFAULT_CLAMP.max}. Skipped (fewer than ${MIN_STATIONS_PER_CITY} stations within 20 km): ${skipped.join(', ') || 'none'}.\n`,
  );

  console.log(
    '| City | Stations | Days with data of',
    dates.length - 1,
    '|\n| --- | ---: | ---: |',
  );
  for (const { city, stationCount, pairs } of runs) {
    console.log(`| ${city.name} | ${stationCount} | ${pairs.length} |`);
  }

  const allPairs = runs.flatMap((run) => run.pairs);
  console.log('\n## Pooled\n');
  printMethodTable(evaluate({ pairs: allPairs }));

  console.log('\n## Per city\n');
  for (const { city, pairs } of runs) {
    console.log(`### ${city.name} (${pairs.length} days)\n`);
    printMethodTable(evaluate({ pairs }));
    console.log();
  }

  console.log(`## Sensitivity: clamp ${WIDE_CLAMP.min.toFixed(2)}–${WIDE_CLAMP.max} (pooled)\n`);
  printMethodTable(evaluate({ pairs: allPairs, clamp: WIDE_CLAMP }));

  console.log('\n## Sensitivity: safety rule needs 1 band better (= no rule) (pooled)\n');
  printMethodTable(evaluate({ pairs: allPairs, minBandsBetter: 1 }));
}

function printMethodTable({ metrics, directionHitRate }: BacktestResult): void {
  const percent = (rate: number) => `${(rate * 100).toFixed(0)}%`;
  const number = (value: number | null) => (value === null ? '–' : value.toFixed(1));
  console.log(
    '| Method | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |',
  );
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const method of Object.keys(METHOD_LABELS) as Method[]) {
    const m = metrics[method];
    console.log(
      `| ${METHOD_LABELS[method]} | ${percent(m.exactBandRate)} | ${percent(m.withinOneBandRate)} | ${percent(m.optimisticRate)} | ${percent(m.pessimisticRate)} | ${number(m.meanBias)} | ${number(m.meanAbsoluteError)} |`,
    );
  }
  console.log(
    `\nTomorrow's direction (better / similar / worse) correct: ${percent(directionHitRate)}`,
  );
}

function datesBetween(from: string, to: string): string[] {
  const result: string[] = [];
  for (let date = from; date <= to; date = offsetDate(date, 1)) result.push(date);
  return result;
}

async function fetchSensorIds(stationIds: string[]): Promise<Map<string, number[]>> {
  const rows = await fetchAllPages<{ id: string; pm25_sensor_ids: number[] | null }>(
    (from, to) =>
      supabase.from('stations').select('id, pm25_sensor_ids').in('id', stationIds).range(from, to),
    1000,
  );
  return new Map(rows.map((row) => [row.id, row.pm25_sensor_ids ?? []]));
}

/** One daily-mean reading per (station, day) from the S3 archive, stamped 00:00Z like the backfill. */
async function fetchReadings({
  stationIds,
  sensorIds,
}: {
  stationIds: string[];
  sensorIds: Map<string, number[]>;
}): Promise<Reading[]> {
  const items = stationIds.flatMap((stationId) => dates.map((date) => ({ stationId, date })));
  const readings: Reading[] = [];
  await runWithConcurrency(items, S3_CONCURRENCY, async ({ stationId, date }) => {
    const csv = await pRetry(() => downloadS3File(buildS3Url(stationId, date)), { retries: 3 });
    if (csv === null) return;
    const primarySensorId = sensorIds.get(stationId)?.[0] ?? -1;
    const mean = computeDailyMean(csv, primarySensorId);
    if (mean === null) return;
    readings.push({ stationId, measuredAt: `${date}T00:00:00Z`, value: mean.value });
  });
  return readings;
}

/**
 * Daily mean of Open-Meteo's hourly CAMS PM2.5 at the 0.4° grid point nearest the city, which is
 * the point the production city page reads (fetchCamsNearest).
 */
async function fetchCamsDailyMeans({ city }: { city: CityDef }): Promise<Map<string, number>> {
  const snap = (value: number, min: number) =>
    Number((min + Math.round((value - min) / AQ_STEP) * AQ_STEP).toFixed(1));
  const params = new URLSearchParams({
    latitude: String(snap(city.lat, AQ_LAT_MIN)),
    longitude: String(snap(city.lng, AQ_LNG_MIN)),
    hourly: 'pm2_5',
    start_date: firstFetchDate,
    end_date: endDate,
    timezone: 'Asia/Bangkok',
  });
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;

  const body = await pRetry(
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as { hourly: { time: string[]; pm2_5: (number | null)[] } };
    },
    { retries: 3, minTimeout: 5_000, factor: 2 },
  );

  const byDate = new Map<string, number[]>();
  body.hourly.time.forEach((time, i) => {
    const value = body.hourly.pm2_5[i];
    if (value === null) return;
    const date = time.slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), value]);
  });
  const means = new Map<string, number>();
  for (const [date, values] of byDate) {
    if (values.length < MIN_HOURLY_VALUES_PER_DAY) continue;
    means.set(date, Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10);
  }
  return means;
}
