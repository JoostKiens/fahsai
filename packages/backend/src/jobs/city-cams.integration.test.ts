import { beforeEach, describe, expect, it } from 'vitest';
import { supabase } from '../db/client.js';
import { clearTables } from '../test/integration/db.js';
import { supabaseCityCamsStore, type CityCamsRow } from './city-cams.js';

const HOUR_MS = 3_600_000;

function runRows(runAt: Date, hours: number[], pm25: number): CityCamsRow[] {
  return hours.map((hour) => ({
    city_slug: 'chiang-mai',
    valid_at: new Date(runAt.getTime() + hour * HOUR_MS).toISOString(),
    pm25,
    run_at: runAt.toISOString(),
    lead_hour: hour,
  }));
}

async function storedRows() {
  const { data, error } = await supabase
    .from('city_cams_hourly')
    .select('valid_at, pm25, run_at')
    .order('valid_at');
  if (error) throw new Error(error.message);
  return data as { valid_at: string; pm25: number; run_at: string }[];
}

describe('supabaseCityCamsStore against a real database', () => {
  beforeEach(async () => {
    await clearTables();
  });

  it('replaces the previous run: its overlapping hours are overwritten, the rest removed', async () => {
    const older = new Date('2026-11-24T00:00:00Z');
    const newer = new Date('2026-11-24T12:00:00Z');
    await supabaseCityCamsStore.replace(runRows(older, [0, 12, 24], 10), older);

    await supabaseCityCamsStore.replace(runRows(newer, [0, 12], 20), newer);

    expect(await storedRows()).toEqual([
      { valid_at: '2026-11-24T12:00:00+00:00', pm25: 20, run_at: '2026-11-24T12:00:00+00:00' },
      { valid_at: '2026-11-25T00:00:00+00:00', pm25: 20, run_at: '2026-11-24T12:00:00+00:00' },
    ]);
  });

  it('counts the rows of one run', async () => {
    const runAt = new Date('2026-11-24T00:00:00Z');
    await supabaseCityCamsStore.replace(runRows(runAt, [0, 1, 2], 10), runAt);

    expect(await supabaseCityCamsStore.countRun(runAt)).toBe(3);
    expect(await supabaseCityCamsStore.countRun(new Date('2026-11-24T12:00:00Z'))).toBe(0);
  });
});
