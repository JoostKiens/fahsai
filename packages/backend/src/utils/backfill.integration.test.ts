import { beforeEach, describe, expect, it } from 'vitest';
import { supabase } from '../db/client.js';
import { clearTables, seed } from '../test/integration/db.js';
import { fetchAllPages, forEachPage } from './backfill.js';

const PAGE_SIZE = 1000;

async function seedReadings(count: number): Promise<void> {
  await seed('stations', [{ id: 's1', name: 'Station 1' }]);
  const start = Date.UTC(2026, 0, 1);
  await seed(
    'station_readings',
    Array.from({ length: count }, (_, i) => ({
      station_id: 's1',
      value: i,
      measured_at: new Date(start + i * 60_000).toISOString(),
    })),
  );
}

// A stable order is required for range() pages not to overlap.
const readingIds = (from: number, to: number) =>
  supabase.from('station_readings').select('id').order('id').range(from, to);

describe('pagination against real PostgREST', () => {
  beforeEach(clearTables);

  it('truncates a bare select at the 1000-row server cap', async () => {
    await seedReadings(2500);

    const { data } = await supabase.from('station_readings').select('id');

    // This is the production incident fetchAllPages exists to prevent. It also guards that
    // supabase/config.toml max_rows still matches production.
    expect(data).toHaveLength(1000);
  });

  it('fetchAllPages returns every row past the cap, without duplicates', async () => {
    await seedReadings(2500);

    const rows = await fetchAllPages<{ id: number }>(readingIds, PAGE_SIZE);

    expect(rows).toHaveLength(2500);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2500);
  });

  it('stops after an exactly full last page', async () => {
    await seedReadings(2000);

    const rows = await fetchAllPages<{ id: number }>(readingIds, PAGE_SIZE);

    expect(rows).toHaveLength(2000);
  });

  it('returns an empty array for an empty table', async () => {
    const rows = await fetchAllPages<{ id: number }>(readingIds, PAGE_SIZE);

    expect(rows).toEqual([]);
  });

  it('forEachPage hands over one page at a time', async () => {
    await seedReadings(2500);
    const sizes: number[] = [];

    await forEachPage<{ id: number }>(readingIds, PAGE_SIZE, (page) => sizes.push(page.length));

    expect(sizes).toEqual([1000, 1000, 500]);
  });

  it('throws the PostgREST error message when a query fails', async () => {
    await expect(
      fetchAllPages(
        (from, to) => supabase.from('station_readings').select('no_such_column').range(from, to),
        PAGE_SIZE,
      ),
    ).rejects.toThrow(/no_such_column/);
  });
});
