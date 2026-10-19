import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '../db/client.js';
import { clearTables, seed, type TableName } from '../test/integration/db.js';
import { runPrune } from './prune.js';

// 01:00 on 2026-10-19 in Bangkok. 140 days earlier is 2026-05-31T18:00:00Z, which is
// 2026-06-01 in Bangkok but 2026-05-31 in UTC: the date-keyed tables only pass if prune
// cuts off on the Bangkok day.
const NOW = new Date('2026-10-18T18:00:00Z');

// [older than the cutoff, exactly at it, recent]: the middle row must survive (`lt`).
const INSTANTS = ['2026-05-31T17:59:59Z', '2026-05-31T18:00:00Z', '2026-10-01T00:00:00Z'];
const DAYS = ['2026-05-31', '2026-06-01', '2026-10-01'];

type Row = Record<string, unknown>;
type Target = {
  key: string;
  table: TableName;
  column: string;
  values: string[];
  row: (value: string, i: number) => Row;
};

const TARGETS: Target[] = [
  {
    key: 'firePointsDeleted',
    table: 'fire_points',
    column: 'detected_at',
    values: INSTANTS,
    row: (detected_at, i) => ({ detected_at, lat: 10 + i, lng: 100 }),
  },
  {
    key: 'measurementsDeleted',
    table: 'station_readings',
    column: 'measured_at',
    values: INSTANTS,
    row: (measured_at) => ({ station_id: 's1', value: 20, measured_at }),
  },
  {
    key: 'aqGridDeleted',
    table: 'cams_grid',
    column: 'date',
    values: DAYS,
    row: (date) => ({ date, lat: 10, lng: 100, pm25: 20 }),
  },
  {
    key: 'weatherReadingsDeleted',
    table: 'weather_readings',
    column: 'date',
    values: DAYS,
    row: (date) => ({ date, lat: 10, lng: 100, wind_direction_deg: 90 }),
  },
  {
    key: 'stationWeatherDeleted',
    table: 'station_weather',
    column: 'date',
    values: DAYS,
    row: (date) => ({ date, station_id: 's1' }),
  },
  {
    key: 'stationFirePressureDeleted',
    table: 'station_fire_pressure',
    column: 'date',
    values: DAYS,
    row: (date) => ({ date, station_id: 's1' }),
  },
  {
    key: 'camsDailySummaryDeleted',
    table: 'cams_daily_summary',
    column: 'date',
    values: DAYS,
    row: (date) => ({ date, pm25_p95: 30, point_count: 4599 }),
  },
];

// PostgREST renders timestamptz as +00:00; compare instants, not strings.
const normalise = (value: string) => (value.includes('T') ? new Date(value).toISOString() : value);

describe('runPrune against a real database', () => {
  beforeEach(async () => {
    await clearTables();
    await seed('stations', [{ id: 's1', name: 'Station 1' }]);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    // only Date: supabase-js still needs real timers
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(TARGETS)(
    '$table: deletes only rows before the cutoff and counts them',
    async ({ key, table, column, values, row }) => {
      await seed(table, values.map(row));

      const result = await runPrune();

      const { data, error } = await supabase.from(table).select(column).order(column);
      expect(error).toBeNull();
      // postgrest-js cannot infer the row type from a non-literal column name
      const remaining = (data as unknown as Record<string, string>[]).map((r) =>
        normalise(r[column]),
      );
      expect(remaining).toEqual([values[1], values[2]].map(normalise));
      expect(result).toEqual({
        ...Object.fromEntries(TARGETS.map((t) => [t.key, 0])),
        [key]: 1,
      });
    },
  );

  it('reports zero deletions on empty tables', async () => {
    const result = await runPrune();

    expect(result).toEqual(Object.fromEntries(TARGETS.map((t) => [t.key, 0])));
  });
});
