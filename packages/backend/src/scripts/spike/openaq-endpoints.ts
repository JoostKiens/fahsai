// JOO-142 spike, questions 2 and 3: which OpenAQ v3 endpoint gives the latest PM2.5 for every
// location in the city footprints, and what one hourly run costs against the key's limits
// (60 requests a minute, 2,000 an hour). Read-only: calls OpenAQ and reads `stations`.
//
//   node --env-file=.env.local --import=tsx/esm src/scripts/spike/openaq-endpoints.ts
import { setTimeout as sleep } from 'node:timers/promises';
import { CITIES } from '../../data/cities.js';
import { supabase } from '../../db/client.js';
import { fetchCityStations } from '../../lib/fetchCityStations.js';

const BASE_URL = 'https://api.openaq.org/v3';
const PM25_PARAMETER_ID = 2;
// 60 a minute is the limit; one call a second keeps a margin for the daily ingest sharing the key
const CALL_SPACING_MS = 1_100;
const FRESH_WINDOW_MS = 2 * 3_600_000;
const HOURS_SAMPLE_SIZE = 5;

const apiKey = process.env.OPENAQ_API_KEY;
if (!apiKey) throw new Error('OPENAQ_API_KEY env var is required');

type Latest = { datetime: { utc: string }; value: number; sensorsId: number; locationsId: number };
type CallLog = { endpoint: string; ms: number; bytes: number; remaining: string | null };

const calls: CallLog[] = [];

async function get<T>(endpoint: string, path: string): Promise<T> {
  await sleep(CALL_SPACING_MS);
  const started = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, { headers: { 'X-API-Key': apiKey ?? '' } });
  const body = await res.text();
  calls.push({
    endpoint,
    ms: Date.now() - started,
    bytes: body.length,
    remaining: res.headers.get('x-ratelimit-remaining'),
  });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${body.slice(0, 200)}`);
  return JSON.parse(body) as T;
}

function isFresh(utc: string, now: number): boolean {
  return now - Date.parse(utc) <= FRESH_WINDOW_MS;
}

// --- Q3: the locations inside all footprints together ---
const footprint = new Map<string, string[]>();
for (const city of CITIES) {
  for (const station of await fetchCityStations(city)) {
    footprint.set(station.id, [...(footprint.get(station.id) ?? []), city.slug]);
  }
}
const ids = [...footprint.keys()];
const { data: sensorRows, error } = await supabase
  .from('stations')
  .select('id, pm25_sensor_ids')
  .in('id', ids);
if (error) throw new Error(`stations: ${error.message}`);
const pm25Sensors = new Map(
  (sensorRows as { id: string; pm25_sensor_ids: number[] }[]).map((r) => [r.id, r.pm25_sensor_ids]),
);
console.log(`footprint locations: ${ids.length} (${CITIES.map((c) => c.slug).join(', ')})`);

// --- endpoint A: /locations/{id}/latest, one call per location ---
const now = Date.now();
const freshByLocation = new Map<string, Latest>();
let firstSensorIsFreshest = 0;
let withPm25Sensors = 0;
for (const id of ids) {
  const sensorIds = pm25Sensors.get(id) ?? [];
  const { results } = await get<{ results: Latest[] }>(
    'locations/{id}/latest',
    `/locations/${id}/latest`,
  );
  const pm25 = results
    .filter((r) => sensorIds.includes(r.sensorsId))
    .sort((a, b) => Date.parse(b.datetime.utc) - Date.parse(a.datetime.utc));
  if (pm25.length === 0) continue;
  withPm25Sensors++;
  if (pm25[0].sensorsId === sensorIds[0]) firstSensorIsFreshest++;
  if (isFresh(pm25[0].datetime.utc, now)) freshByLocation.set(id, pm25[0]);
}
console.log(
  `A /locations/{id}/latest: ${ids.length} calls, ${freshByLocation.size} locations with PM2.5 in the last 2 h; ` +
    `pm25_sensor_ids[0] is the freshest PM2.5 sensor at ${firstSensorIsFreshest}/${withPm25Sensors}`,
);

// --- endpoint B: /parameters/2/latest, global, paged; does datetime_min shrink it? ---
async function pageThrough(label: string, query: string): Promise<Latest[]> {
  const all: Latest[] = [];
  for (let page = 1; ; page++) {
    const data = await get<{ meta: { found: number | string }; results: Latest[] }>(
      label,
      `/parameters/${PM25_PARAMETER_ID}/latest?limit=1000&page=${page}${query}`,
    );
    all.push(...data.results);
    if (data.results.length < 1000) return all;
  }
}
const sinceIso = new Date(now - FRESH_WINDOW_MS).toISOString();
const filtered = await pageThrough(
  'parameters/2/latest?datetime_min',
  `&datetime_min=${encodeURIComponent(sinceIso)}`,
);
const isFilterHonoured = filtered.every((r) => isFresh(r.datetime.utc, now));
const global = isFilterHonoured ? filtered : await pageThrough('parameters/2/latest', '');
const globalHits = new Set(
  global
    .filter((r) => footprint.has(String(r.locationsId)) && isFresh(r.datetime.utc, now))
    .map((r) => String(r.locationsId)),
);
console.log(
  // pages have no stable order, so they overlap and skip rows: unique sensors < rows
  `B /parameters/2/latest: datetime_min honoured=${isFilterHonoured}, ${global.length} rows, ` +
    `${new Set(global.map((r) => r.sensorsId)).size} unique sensors, ` +
    `${calls.filter((c) => c.endpoint.startsWith('parameters')).length} calls; ` +
    `${globalHits.size} footprint locations fresh (A found ${freshByLocation.size})`,
);

// --- endpoint C: /sensors/{id}/hours, one call per sensor; how far behind /latest is it? ---
for (const latest of [...freshByLocation.values()].slice(0, HOURS_SAMPLE_SIZE)) {
  const { results } = await get<{ results: { period: { datetimeTo: { utc: string } } }[] }>(
    'sensors/{id}/hours',
    `/sensors/${latest.sensorsId}/hours?datetime_from=${encodeURIComponent(sinceIso)}&limit=10`,
  );
  const lastHour = results.at(-1)?.period.datetimeTo.utc ?? 'none';
  console.log(
    `C sensor ${latest.sensorsId}: /latest ${latest.datetime.utc}, last /hours ${lastHour}`,
  );
}

// --- endpoint D: /locations?bbox, one call per city; says who is alive, carries no values ---
const city = CITIES[0];
await get(
  'locations?coordinates',
  `/locations?coordinates=${city.lat},${city.lng}&radius=20000&limit=1000`,
);

console.log('\nendpoint                          calls  median ms  total KB  last remaining');
for (const endpoint of [...new Set(calls.map((c) => c.endpoint))]) {
  const mine = calls.filter((c) => c.endpoint === endpoint);
  const ms = mine.map((c) => c.ms).sort((a, b) => a - b);
  const kb = Math.round(mine.reduce((sum, c) => sum + c.bytes, 0) / 1024);
  console.log(
    `${endpoint.padEnd(34)}${String(mine.length).padStart(5)}${String(ms[Math.floor(ms.length / 2)]).padStart(11)}` +
      `${String(kb).padStart(10)}  ${mine.at(-1)?.remaining ?? '?'}`,
  );
}
