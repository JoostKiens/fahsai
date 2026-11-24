import { setTimeout as sleep } from 'node:timers/promises';
import pRetry from 'p-retry';
import { supabase } from '../db/client.js';
import { fetchAllPages } from '../utils/backfill.js';
import type { LatestPm25Result } from '../utils/openaq.js';

const LOG = '[station-readings-hourly]';
// ~54 a minute, under the key's 60. A 429 still waits for the reset inside getWithRetries.
const CALL_SPACING_MS = 1_100;
// At :45 every live location has the hour that ended 45 minutes ago (JOO-142). Older values are
// from a station that stopped reporting; storing them would let a dead station count as "now".
const MAX_AGE_MS = 2 * 3_600_000;
// Same reasoning as the daily ingest: a run of failures means OpenAQ is down or the quota is gone.
const CONSECUTIVE_FAILURE_ABORT = 5;
const PAGE_SIZE = 1000;
const DB_BATCH_SIZE = 500;

export type FootprintStation = { id: string; pm25SensorIds: number[] };

export type HourlyReadingRow = {
  station_id: string;
  measured_at: string;
  pm25: number;
  sensor_id: number;
};

export type HourlyReadingStore = { upsert(rows: HourlyReadingRow[]): Promise<void> };

export type HourlyIngestResult = {
  queried: number;
  failed: number;
  stored: number;
  /** stopped early after CONSECUTIVE_FAILURE_ABORT failures in a row */
  aborted: boolean;
};

/**
 * Stores the latest hourly PM2.5 of every footprint station. A location that fails after its
 * retries is counted and skipped; what was fetched is always written, so the caller decides
 * whether the run was too incomplete.
 */
export async function runStationReadingsHourlyIngest({
  now,
  stations,
  fetchLatest,
  store,
  spacingMs = CALL_SPACING_MS,
}: {
  now: Date;
  stations: readonly FootprintStation[];
  fetchLatest: (station: FootprintStation) => Promise<LatestPm25Result>;
  store: HourlyReadingStore;
  spacingMs?: number;
}): Promise<HourlyIngestResult> {
  const rows: HourlyReadingRow[] = [];
  let queried = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let aborted = false;

  for (const station of stations) {
    if (queried > 0) await sleep(spacingMs);
    queried++;
    const { reading, failed: isFailed } = await fetchLatest(station);

    consecutiveFailures = isFailed ? consecutiveFailures + 1 : 0;
    if (isFailed) failed++;
    if (consecutiveFailures >= CONSECUTIVE_FAILURE_ABORT) {
      aborted = true;
      console.warn(`${LOG} ${consecutiveFailures} locations failed in a row, stopping`);
      break;
    }

    const isFresh =
      reading !== null && now.getTime() - Date.parse(reading.measuredAt) <= MAX_AGE_MS;
    if (!isFresh) continue;
    rows.push({
      station_id: station.id,
      measured_at: reading.measuredAt,
      pm25: reading.value,
      sensor_id: reading.sensorId,
    });
  }

  if (rows.length > 0) await store.upsert(rows);
  console.log(`${LOG} ${rows.length} fresh readings from ${queried} locations, ${failed} failed`);
  return { queried, failed, stored: rows.length, aborted };
}

/** The given footprint stations that have a PM2.5 sensor, each once. */
export async function fetchFootprintStations(
  stationIds: readonly string[],
): Promise<FootprintStation[]> {
  const ids = new Set(stationIds);
  const rows = await fetchAllPages<{ id: string; pm25_sensor_ids: number[] | null }>(
    (from, to) =>
      supabase
        .from('stations')
        .select('id, pm25_sensor_ids')
        .in('id', [...ids])
        .order('id')
        .range(from, to),
    PAGE_SIZE,
  );
  return rows
    .filter((row) => (row.pm25_sensor_ids ?? []).length > 0)
    .map((row) => ({ id: row.id, pm25SensorIds: row.pm25_sensor_ids ?? [] }));
}

export const supabaseHourlyReadingStore: HourlyReadingStore = {
  async upsert(rows) {
    for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
      const batch = rows.slice(i, i + DB_BATCH_SIZE);
      await pRetry(
        async () => {
          const { error } = await supabase
            .from('station_readings_hourly')
            .upsert(batch, { onConflict: 'station_id,measured_at' });
          if (error) throw new Error(`${LOG} upsert failed: ${error.message}`);
        },
        { retries: 3, minTimeout: 1_000, factor: 2 },
      );
    }
  },
};
