import { beforeEach, describe, expect, it } from 'vitest';
import { supabase } from '../../db/client.js';
import { clearTables, seed } from './db.js';

describe('integration harness', () => {
  beforeEach(clearTables);

  it('round-trips rows through PostgREST', async () => {
    await seed('stations', [{ id: 'smoke', name: 'Smoke' }]);
    await seed('station_readings', [
      { station_id: 'smoke', value: 12.5, measured_at: '2026-01-01T00:00:00Z' },
    ]);

    const { data, error } = await supabase.from('station_readings').select('station_id, value');

    expect(error).toBeNull();
    expect(data).toEqual([{ station_id: 'smoke', value: 12.5 }]);
  });

  it('starts every test from empty tables', async () => {
    const { count } = await supabase.from('stations').select('*', { count: 'exact', head: true });

    expect(count).toBe(0);
  });
});
