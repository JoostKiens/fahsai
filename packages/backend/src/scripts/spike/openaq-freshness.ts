// JOO-142 spike, question 1: how old is the latest hourly PM2.5 value when we ask? Samples the
// Chiang Mai locations at :00, :15, :30 and :45 past the hour and writes one JSON line per location
// per sample, then prints the age by provider and by minute past the hour.
//
//   node --env-file=.env.local --import=tsx/esm src/scripts/spike/openaq-freshness.ts --hours=6 --out=<file>
//   node --env-file=.env.local --import=tsx/esm src/scripts/spike/openaq-freshness.ts --summarize=<file>
import { appendFileSync, readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { findCity } from '../../data/cities.js';

const BASE_URL = 'https://api.openaq.org/v3';
const CALL_SPACING_MS = 1_100;
const SAMPLE_EVERY_MS = 15 * 60_000;
const ACTIVE_WITHIN_MS = 30 * 86_400_000;
const RADIUS_M = 20_000;

type Sample = {
  sampledAt: string;
  minutePastHour: number;
  locationId: number;
  provider: string;
  sensorId: number | null;
  valueAt: string | null;
  ageMin: number | null;
};
type LocationRow = {
  id: number;
  provider: { name: string } | null;
  sensors: { id: number; parameter: { name: string } }[];
  datetimeLast: { utc: string } | null;
};
type Latest = { datetime: { utc: string }; sensorsId: number };

const { values: args } = parseArgs({
  options: { hours: { type: 'string' }, out: { type: 'string' }, summarize: { type: 'string' } },
});

if (args.summarize !== undefined) {
  summarize(readSamples(args.summarize));
} else {
  if (args.out === undefined) throw new Error('--out=<file> is required');
  const hours = Number(args.hours ?? 6);
  if (!(hours > 0)) throw new Error('--hours must be a positive number');
  await sampleFor({ hours, out: args.out });
  summarize(readSamples(args.out));
}

async function sampleFor({ hours, out }: { hours: number; out: string }): Promise<void> {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) throw new Error('OPENAQ_API_KEY env var is required');
  const get = async <T>(path: string): Promise<T> => {
    await sleep(CALL_SPACING_MS);
    const res = await fetch(`${BASE_URL}${path}`, { headers: { 'X-API-Key': apiKey } });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  const city = findCity('chiang-mai');
  if (city === undefined) throw new Error('chiang-mai is not in CITIES');
  const { results } = await get<{ results: LocationRow[] }>(
    `/locations?coordinates=${city.lat},${city.lng}&radius=${RADIUS_M}&limit=1000`,
  );
  const locations = results.filter(
    (l) =>
      l.datetimeLast !== null &&
      Date.now() - Date.parse(l.datetimeLast.utc) < ACTIVE_WITHIN_MS &&
      l.sensors.some((s) => s.parameter.name === 'pm25'),
  );
  console.log(`sampling ${locations.length} Chiang Mai locations for ${hours} h into ${out}`);

  const endAt = Date.now() + hours * 3_600_000;
  for (;;) {
    // align to the next quarter hour
    await sleep(SAMPLE_EVERY_MS - (Date.now() % SAMPLE_EVERY_MS));
    if (Date.now() > endAt) return;
    const sampledAt = new Date();
    for (const location of locations) {
      const pm25 = new Set(
        location.sensors.filter((s) => s.parameter.name === 'pm25').map((s) => s.id),
      );
      let freshest: Latest | undefined;
      try {
        const latest = await get<{ results: Latest[] }>(`/locations/${location.id}/latest`);
        freshest = latest.results
          .filter((r) => pm25.has(r.sensorsId))
          .sort((a, b) => Date.parse(b.datetime.utc) - Date.parse(a.datetime.utc))[0];
      } catch (err) {
        // one failed call is a missing sample, not a reason to stop a 6-hour run
        console.warn(`location ${location.id}: ${(err as Error).message}`);
      }
      const sample: Sample = {
        sampledAt: sampledAt.toISOString(),
        // a timer that fires a moment early or late still counts for its quarter-hour mark
        minutePastHour: (Math.round(sampledAt.getUTCMinutes() / 15) * 15) % 60,
        locationId: location.id,
        provider: location.provider?.name ?? 'unknown',
        sensorId: freshest?.sensorsId ?? null,
        valueAt: freshest?.datetime.utc ?? null,
        ageMin:
          freshest === undefined
            ? null
            : Math.round((sampledAt.getTime() - Date.parse(freshest.datetime.utc)) / 60_000),
      };
      appendFileSync(out, `${JSON.stringify(sample)}\n`);
    }
    console.log(`${sampledAt.toISOString()}: sampled ${locations.length}`);
  }
}

function readSamples(file: string): Sample[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as Sample);
}

function summarize(samples: Sample[]): void {
  // a location whose value is more than a day old is offline, not late
  const live = samples.filter((s) => s.ageMin !== null && s.ageMin <= 24 * 60);
  console.log(`\n${samples.length} samples, ${live.length} live (value at most 24 h old)`);
  console.log('provider      minute  n    median age  p90 age  (minutes)');
  for (const provider of [...new Set(live.map((s) => s.provider))].sort()) {
    for (const minute of [0, 15, 30, 45]) {
      const ages = live
        .filter((s) => s.provider === provider && s.minutePastHour === minute)
        .map((s) => s.ageMin ?? 0)
        .sort((a, b) => a - b);
      if (ages.length === 0) continue;
      const at = (q: number) => ages[Math.min(ages.length - 1, Math.floor(q * ages.length))];
      console.log(
        `${provider.padEnd(14)}:${String(minute).padStart(2, '0')}    ${String(ages.length).padEnd(5)}` +
          `${String(at(0.5)).padStart(10)}${String(at(0.9)).padStart(9)}`,
      );
    }
  }
}
