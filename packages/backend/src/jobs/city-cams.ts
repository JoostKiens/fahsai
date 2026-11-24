import pRetry from 'p-retry';
import type { CityDef } from '../data/cities.js';
import { supabase } from '../db/client.js';
import { footprintCellWeights, footprintValue } from '../lib/cityCams.js';
import { fetchCamsGrib, isRunNotPublished, type CamsRun } from '../utils/camsAds.js';
import { toMicrograms } from '../utils/camsResample.js';
import { decodeGrib1, type Grib1Message } from '../utils/grib1.js';

const LOG = '[city-cams]';
const HOUR_MS = 3_600_000;
const RUN_EVERY_MS = 12 * HOUR_MS;
// Runs appeared on the ADS 9.7 to 10.4 hours after their run time (JOO-142).
const PUBLISH_DELAY_MS = 10 * HOUR_MS;
export const LEAD_HOURS = Array.from({ length: 121 }, (_, hour) => hour);
const DB_BATCH_SIZE = 500;
// The cron's second slot comes an hour later; a job still queued by then is better dropped.
const POLL_TIMEOUT_MS = 30 * 60_000;

export type CityCamsRow = {
  city_slug: string;
  valid_at: string;
  pm25: number;
  run_at: string;
  lead_hour: number;
};

export type CityCamsStore = {
  /** How many rows the table holds for this run */
  countRun(runAt: Date): Promise<number>;
  /** Writes the run's rows, then removes the rows of older runs */
  replace(rows: CityCamsRow[], runAt: Date): Promise<void>;
};

export type CityCamsResult =
  | { status: 'stored'; runAt: string; rows: number }
  | { status: 'already-stored'; runAt: string }
  | { status: 'not-published'; runAt: string };

/** The newest run that should be on the ADS by now. */
export function latestRunAt(now: Date): Date {
  return new Date(Math.floor((now.getTime() - PUBLISH_DELAY_MS) / RUN_EVERY_MS) * RUN_EVERY_MS);
}

/**
 * Stores the newest CAMS run per city: lead hours 0 to 120, each the mean of the cells the city's
 * footprint overlaps. Does nothing when the run is already stored, and stops without failing when
 * the ADS does not hold the run yet, so the cron's next slot can pick it up.
 */
export async function runCityCamsIngest({
  now,
  cities,
  fetchRun,
  store,
}: {
  now: Date;
  cities: readonly CityDef[];
  fetchRun: (runAt: Date) => Promise<Grib1Message[]>;
  store: CityCamsStore;
}): Promise<CityCamsResult> {
  const runAt = latestRunAt(now);
  const runIso = runAt.toISOString();

  if ((await store.countRun(runAt)) === cities.length * LEAD_HOURS.length) {
    console.log(`${LOG} run ${runIso} is already stored`);
    return { status: 'already-stored', runAt: runIso };
  }

  let messages: Grib1Message[];
  try {
    messages = await fetchRun(runAt);
  } catch (err) {
    if (!isRunNotPublished(err)) throw err;
    console.log(`${LOG} run ${runIso} is not on the ADS yet`);
    return { status: 'not-published', runAt: runIso };
  }

  const rows = cityRows({ messages, cities, runAt });
  await store.replace(rows, runAt);
  console.log(`${LOG} stored ${rows.length} rows for run ${runIso}`);
  return { status: 'stored', runAt: runIso, rows: rows.length };
}

/** One row per city and lead hour. Throws unless every lead hour came back. */
export function cityRows({
  messages,
  cities,
  runAt,
}: {
  messages: Grib1Message[];
  cities: readonly CityDef[];
  runAt: Date;
}): CityCamsRow[] {
  // Replacing a full run with a partial one would blank hours the page needs.
  const hours = new Set(messages.map((m) => m.leadHour));
  const isFullRun = messages.length === LEAD_HOURS.length && LEAD_HOURS.every((h) => hours.has(h));
  if (!isFullRun) throw new Error(`${LOG} expected lead hours 0 to 120, got ${hours.size} hours`);

  const [first] = messages;
  const weightsByCity = cities.map((city) => ({
    city,
    weights: footprintCellWeights(city, first),
  }));
  return messages.flatMap((message) => {
    const { values } = toMicrograms(message);
    const validAt = new Date(runAt.getTime() + message.leadHour * HOUR_MS).toISOString();
    return weightsByCity.map(({ city, weights }) => ({
      city_slug: city.slug,
      valid_at: validAt,
      pm25: Math.round(footprintValue(values, weights) * 10) / 10,
      run_at: runAt.toISOString(),
      lead_hour: message.leadHour,
    }));
  });
}

/** The newest run's request: the run's own date and time, every lead hour from 0 to 120. */
export async function fetchRunMessages(runAt: Date, apiKey: string): Promise<Grib1Message[]> {
  const run: CamsRun = {
    // runDayOffset 0 makes the date argument the run date itself
    runDayOffset: 0,
    time: runAt.getUTCHours() === 12 ? '12:00' : '00:00',
    leadHours: LEAD_HOURS,
    leadShift: 0,
  };
  const grib = await fetchCamsGrib({
    date: runAt.toISOString().slice(0, 10),
    run,
    apiKey,
    pollTimeoutMs: POLL_TIMEOUT_MS,
  });
  return decodeGrib1(grib);
}

export const supabaseCityCamsStore: CityCamsStore = {
  async countRun(runAt) {
    const { count, error } = await supabase
      .from('city_cams_hourly')
      .select('city_slug', { count: 'exact', head: true })
      .eq('run_at', runAt.toISOString());
    if (error) throw new Error(`${LOG} count failed: ${error.message}`);
    return count ?? 0;
  },

  async replace(rows, runAt) {
    // Upsert first, delete after: a reader never finds the table empty.
    for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
      const batch = rows.slice(i, i + DB_BATCH_SIZE);
      await withRetry(`upsert batch ${i / DB_BATCH_SIZE + 1}`, async () => {
        const { error } = await supabase
          .from('city_cams_hourly')
          .upsert(batch, { onConflict: 'city_slug,valid_at' });
        if (error) throw new Error(`${LOG} upsert failed: ${error.message}`);
      });
    }
    await withRetry('delete older runs', async () => {
      const { error } = await supabase
        .from('city_cams_hourly')
        .delete()
        .lt('run_at', runAt.toISOString());
      if (error) throw new Error(`${LOG} delete failed: ${error.message}`);
    });
  },
};

function withRetry(label: string, write: () => Promise<void>): Promise<void> {
  return pRetry(write, {
    retries: 3,
    minTimeout: 1000,
    factor: 2,
    onFailedAttempt: ({ error, attemptNumber, retriesLeft }) =>
      console.warn(
        `${LOG} ${label} attempt ${attemptNumber} failed, ${retriesLeft} retries left: ${error.message}`,
      ),
  });
}
