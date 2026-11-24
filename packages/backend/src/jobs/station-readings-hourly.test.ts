import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));

import type { LatestPm25Result } from '../utils/openaq.js';
import {
  runStationReadingsHourlyIngest,
  type FootprintStation,
  type HourlyReadingRow,
} from './station-readings-hourly.js';

const NOW = new Date('2026-11-24T12:45:00Z');
const noLimit = { rateLimitRemaining: null, rateLimitResetMs: null };

const stations = (count: number): FootprintStation[] =>
  Array.from({ length: count }, (_, i) => ({ id: String(i + 1), pm25SensorIds: [i + 100] }));

const reading = (measuredAt: string, value = 40): LatestPm25Result => ({
  reading: { sensorId: 100, value, measuredAt },
  failed: false,
  ...noLimit,
});
const failure: LatestPm25Result = { reading: null, failed: true, ...noLimit };

function run(stationList: FootprintStation[], results: LatestPm25Result[]) {
  const stored: HourlyReadingRow[] = [];
  const fetchLatest = vi.fn<(s: FootprintStation) => Promise<LatestPm25Result>>();
  for (const result of results) fetchLatest.mockResolvedValueOnce(result);
  const promise = runStationReadingsHourlyIngest({
    now: NOW,
    stations: stationList,
    fetchLatest,
    store: {
      upsert: (rows) => {
        stored.push(...rows);
        return Promise.resolve();
      },
    },
    spacingMs: 0,
  });
  return { promise, stored, fetchLatest };
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('runStationReadingsHourlyIngest', () => {
  it('stores a fresh reading per station', async () => {
    const { promise, stored } = run(stations(1), [reading('2026-11-24T12:00:00Z')]);

    await promise;

    expect(stored).toEqual([
      { station_id: '1', measured_at: '2026-11-24T12:00:00Z', pm25: 40, sensor_id: 100 },
    ]);
  });

  it('skips readings older than 2 hours', async () => {
    const { promise, stored } = run(stations(1), [reading('2026-11-24T10:00:00Z')]);

    const result = await promise;

    expect(stored).toEqual([]);
    expect(result.stored).toBe(0);
  });

  it('counts a failed location and keeps going', async () => {
    const { promise, stored } = run(stations(2), [failure, reading('2026-11-24T12:00:00Z')]);

    const result = await promise;

    expect(result).toMatchObject({ queried: 2, failed: 1, stored: 1, aborted: false });
    expect(stored).toHaveLength(1);
  });

  it('stops after 5 failures in a row but still writes what it fetched', async () => {
    const { promise, stored, fetchLatest } = run(stations(8), [
      reading('2026-11-24T12:00:00Z'),
      failure,
      failure,
      failure,
      failure,
      failure,
    ]);

    const result = await promise;

    expect(result).toMatchObject({ aborted: true, failed: 5 });
    expect(fetchLatest).toHaveBeenCalledTimes(6);
    expect(stored).toHaveLength(1);
  });

  it('does nothing for no stations', async () => {
    const { promise, stored } = run([], []);

    expect(await promise).toEqual({ queried: 0, failed: 0, stored: 0, aborted: false });
    expect(stored).toEqual([]);
  });
});
