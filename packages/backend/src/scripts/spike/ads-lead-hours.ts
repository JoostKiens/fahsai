// JOO-142 spike, question 4: how long does an ADS request for lead hours 0 to N take in the queue,
// how big is the file and how long does decoding take? Runs one request per --max-lead value, one
// after the other, so they don't queue against each other. Appends one JSON line per request.
//
//   node --env-file=.env.local --import=tsx/esm src/scripts/spike/ads-lead-hours.ts \
//     --run-date=YYYY-MM-DD --time=00:00 --max-lead=16,72,120 --out=<file>
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fetchCamsGrib, type CamsRun } from '../../utils/camsAds.js';
import { decodeGrib1 } from '../../utils/grib1.js';

const { values: args } = parseArgs({
  options: {
    'run-date': { type: 'string' },
    time: { type: 'string', default: '00:00' },
    'max-lead': { type: 'string', default: '16,72,120' },
    out: { type: 'string' },
  },
});
const runDate = args['run-date'];
const time = args.time;
const out = args.out;
if (runDate === undefined || out === undefined)
  throw new Error('--run-date and --out are required');
if (time !== '00:00' && time !== '12:00') throw new Error('--time must be 00:00 or 12:00');
const apiKey = process.env.ADS_API_KEY;
if (!apiKey) throw new Error('ADS_API_KEY env var is required');

const maxLeads = args['max-lead'].split(',').map(Number);
if (!maxLeads.every((n) => Number.isInteger(n) && n >= 0))
  throw new Error('--max-lead must be comma-separated whole numbers');

for (const maxLead of maxLeads) {
  // runDayOffset 0 makes the "Bangkok date" argument the run date itself
  const run: CamsRun = {
    runDayOffset: 0,
    time,
    leadHours: Array.from({ length: maxLead + 1 }, (_, i) => i),
    leadShift: 0,
  };
  const marks: { submittedAt?: number; successAt?: number; downloadStart?: number } = {};
  // Timestamps the calls fetchCamsGrib makes, so queue time and download time can be told apart.
  const timedFetch: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const isAdsApi = url.includes('/api/retrieve/v1/');
    if (!isAdsApi) marks.downloadStart = Date.now();
    const res = await fetch(input, init);
    if (url.endsWith('/execution')) marks.submittedAt = Date.now();
    // only a successful poll is JSON for sure; leave error bodies to fetchCamsGrib
    if (res.ok && isAdsApi && url.includes('/jobs/') && !url.endsWith('/results')) {
      const state = (await res.clone().json()) as { status?: string };
      if (state.status === 'successful') marks.successAt = Date.now();
    }
    return res;
  };

  const startedAt = new Date();
  const grib = await fetchCamsGrib({ date: runDate, run, apiKey, fetchImpl: timedFetch });
  const downloadedAt = Date.now();
  const decodeStart = performance.now();
  const messages = decodeGrib1(grib);
  const decodeMs = Math.round(performance.now() - decodeStart);

  const result = {
    startedAt: startedAt.toISOString(),
    runDate,
    time,
    maxLead,
    queueS: Math.round(((marks.successAt ?? 0) - (marks.submittedAt ?? 0)) / 1000),
    downloadS: Math.round((downloadedAt - (marks.downloadStart ?? downloadedAt)) / 1000),
    totalS: Math.round((downloadedAt - startedAt.getTime()) / 1000),
    fileMB: Math.round((grib.length / 1_048_576) * 10) / 10,
    decodeMs,
    messages: messages.length,
    rssMB: Math.round(process.memoryUsage().rss / 1_048_576),
  };
  console.log(JSON.stringify(result));
  appendFileSync(out, `${JSON.stringify(result)}\n`);
}
