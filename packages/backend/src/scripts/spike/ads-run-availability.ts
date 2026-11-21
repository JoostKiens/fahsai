// JOO-142 spike, question 5: when do the 00 and 12 UTC CAMS runs actually appear on the ADS? For
// each of the next --runs runs, from 4 hours after the run time, submits a one-lead-hour request
// every 20 minutes until it succeeds, separately for the first and the last lead hour we may need.
// Appends one JSON line per probe.
//
//   node --env-file=.env.local --import=tsx/esm src/scripts/spike/ads-run-availability.ts --runs=4 --out=<file>
//   node --env-file=.env.local --import=tsx/esm src/scripts/spike/ads-run-availability.ts --check=YYYY-MM-DDT00 --out=<file>
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { AdsHttpError, fetchCamsGrib, type CamsRun } from '../../utils/camsAds.js';
import { decodeGrib1 } from '../../utils/grib1.js';

const HOUR_MS = 3_600_000;
const FIRST_PROBE_AFTER_MS = 4 * HOUR_MS;
// the next run's probing starts then, so the probes never overlap
const GIVE_UP_AFTER_MS = 16 * HOUR_MS;
const PROBE_EVERY_MS = 20 * 60_000;
const PROBE_LEAD_HOURS = [0, 120];

const { values: args } = parseArgs({
  options: {
    runs: { type: 'string', default: '4' },
    check: { type: 'string' },
    out: { type: 'string' },
  },
});
const out = args.out;
if (out === undefined) throw new Error('--out=<file> is required');
const apiKey = process.env.ADS_API_KEY;
if (!apiKey) throw new Error('ADS_API_KEY env var is required');

if (args.check !== undefined) {
  // self-check: a run that is surely published must succeed at the first probe
  const runAt = Date.parse(`${args.check}:00:00Z`);
  for (const leadHour of PROBE_LEAD_HOURS) await probe({ runAt, leadHour, out, apiKey });
} else {
  for (const runAt of nextRuns(Number(args.runs))) await waitForRun({ runAt, out, apiKey });
}

function nextRuns(count: number): number[] {
  const firstRun = Math.ceil((Date.now() - FIRST_PROBE_AFTER_MS) / (12 * HOUR_MS)) * 12 * HOUR_MS;
  return Array.from({ length: count }, (_, i) => firstRun + i * 12 * HOUR_MS);
}

async function waitForRun({ runAt, out, apiKey }: { runAt: number; out: string; apiKey: string }) {
  const startAt = runAt + FIRST_PROBE_AFTER_MS;
  console.log(
    `run ${new Date(runAt).toISOString()}: first probe at ${new Date(startAt).toISOString()}`,
  );
  await sleep(Math.max(0, startAt - Date.now()));
  const pending = new Set(PROBE_LEAD_HOURS);
  while (pending.size > 0 && Date.now() < runAt + GIVE_UP_AFTER_MS) {
    const probeStart = Date.now();
    for (const leadHour of [...pending]) {
      if (await probe({ runAt, leadHour, out, apiKey })) pending.delete(leadHour);
    }
    if (pending.size > 0) await sleep(Math.max(0, PROBE_EVERY_MS - (Date.now() - probeStart)));
  }
}

async function probe({
  runAt,
  leadHour,
  out,
  apiKey,
}: {
  runAt: number;
  leadHour: number;
  out: string;
  apiKey: string;
}): Promise<boolean> {
  const runIso = new Date(runAt).toISOString();
  const run: CamsRun = {
    runDayOffset: 0,
    time: runIso.slice(11, 16) === '12:00' ? '12:00' : '00:00',
    leadHours: [leadHour],
    leadShift: 0,
  };
  const submittedAt = Date.now();
  let outcome: 'available' | 'not-yet' | 'error';
  let detail = '';
  try {
    const grib = await fetchCamsGrib({
      date: runIso.slice(0, 10),
      run,
      apiKey,
      pollTimeoutMs: 15 * 60_000,
    });
    const messages = decodeGrib1(grib).length;
    outcome = messages > 0 ? 'available' : 'not-yet';
    detail = `${messages} messages`;
  } catch (err) {
    // the ADS rejects a request for a run it does not hold yet (seen 2026-11-21), not a failed job
    const isNotPublished =
      err instanceof AdsHttpError &&
      err.status === 400 &&
      err.message.includes('not produced a valid combination');
    outcome = isNotPublished ? 'not-yet' : 'error';
    detail = (err as Error).message.slice(0, 300);
  }
  const line = {
    run: runIso,
    leadHour,
    submittedAt: new Date(submittedAt).toISOString(),
    hoursAfterRun: Math.round(((submittedAt - runAt) / HOUR_MS) * 100) / 100,
    jobS: Math.round((Date.now() - submittedAt) / 1000),
    outcome,
    detail,
  };
  console.log(JSON.stringify(line));
  appendFileSync(out, `${JSON.stringify(line)}\n`);
  return outcome === 'available';
}
