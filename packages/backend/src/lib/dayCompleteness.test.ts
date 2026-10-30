import { describe, it, expect, vi, beforeEach } from 'vitest';

type CountResult = { count: number | null; error: { message: string } | null };

const { results, filters } = vi.hoisted(() => ({
  results: new Map<string, CountResult>(),
  filters: new Map<string, [string, string, string][]>(),
}));

// A thenable stand-in for the Supabase query builder: records each filter, resolves to the
// count result set for its table.
vi.mock('../db/client.js', () => ({
  supabase: {
    from: (table: string) => {
      const recorded: [string, string, string][] = [];
      filters.set(table, recorded);
      const filter = (op: string) => (column: string, value: string) => {
        recorded.push([op, column, value]);
        return query;
      };
      const query = {
        select: () => query,
        eq: filter('eq'),
        gte: filter('gte'),
        lt: filter('lt'),
        then: (resolve: (r: CountResult) => unknown) =>
          resolve(results.get(table) ?? { count: 0, error: null }),
      };
      return query;
    },
  },
}));

import { checkDayCompleteness } from './dayCompleteness.js';

function setCounts(camsGrid: number, stationReadings: number, weatherReadings: number) {
  results.set('cams_grid', { count: camsGrid, error: null });
  results.set('station_readings', { count: stationReadings, error: null });
  results.set('weather_readings', { count: weatherReadings, error: null });
}

beforeEach(() => {
  results.clear();
  filters.clear();
  setCounts(4599, 900, 4599);
});

describe('checkDayCompleteness', () => {
  it('is complete with full grids and at least one station reading', async () => {
    expect(await checkDayCompleteness('2026-10-29')).toEqual({
      isComplete: true,
      counts: { camsGrid: 4599, stationReadings: 900, weatherReadings: 4599 },
    });
  });

  it('accepts grids of exactly 4,000 rows and a single station reading', async () => {
    setCounts(4000, 1, 4000);
    expect((await checkDayCompleteness('2026-10-29')).isComplete).toBe(true);
  });

  it.each([
    ['a partial CAMS grid', 3999, 900, 4599],
    ['no station readings', 4599, 0, 4599],
    ['a partial weather grid', 4599, 900, 3999],
  ])('is incomplete with %s', async (_label, cams, readings, weather) => {
    setCounts(cams, readings, weather);
    expect((await checkDayCompleteness('2026-10-29')).isComplete).toBe(false);
  });

  it('counts station readings over the Bangkok calendar day', async () => {
    await checkDayCompleteness('2026-10-29');
    expect(filters.get('station_readings')).toEqual([
      ['gte', 'measured_at', '2026-10-29T00:00:00+07:00'],
      ['lt', 'measured_at', '2026-10-30T00:00:00+07:00'],
    ]);
  });

  it('throws instead of reporting zero rows when a count query fails', async () => {
    results.set('station_readings', { count: null, error: { message: 'statement timeout' } });
    await expect(checkDayCompleteness('2026-10-29')).rejects.toThrow(
      'station_readings count failed: statement timeout',
    );
  });
});
