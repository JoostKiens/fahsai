// packages/backend/src/utils/computeStationWeather.test.ts
import { describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted before imports by Vitest — this prevents db/client.ts from
// throwing when SUPABASE_* env vars are absent in the test environment.
vi.mock('../db/client.js', () => ({ supabase: {} }));

import { snapToGrid, SNAP_LAT_MIN, SNAP_LNG_MIN } from './computeStationWeather.js';

describe('snapToGrid', () => {
  it('returns the min value when coord is exactly on the grid origin', () => {
    expect(snapToGrid(SNAP_LAT_MIN, SNAP_LAT_MIN)).toBe(SNAP_LAT_MIN); // 1.0
  });

  it('snaps a coord already on a grid point to itself', () => {
    // 1.0 + 0.4 = 1.4 — already on grid
    expect(snapToGrid(1.4, SNAP_LAT_MIN)).toBe(1.4);
  });

  it('snaps a coord slightly above a grid point upward', () => {
    // 1.21 is closer to 1.4 than to 1.0 → snaps to 1.4
    expect(snapToGrid(1.21, SNAP_LAT_MIN)).toBe(1.4);
  });

  it('snaps a coord slightly below a grid point downward', () => {
    // 1.19 is closer to 1.0 than to 1.4 → snaps to 1.0
    expect(snapToGrid(1.19, SNAP_LAT_MIN)).toBe(1.0);
  });

  it('result has at most 2 decimal places (no float drift)', () => {
    // 13.756 (Bangkok lat) should produce a clean decimal, not 13.800000000001
    const result = snapToGrid(13.756, SNAP_LAT_MIN);
    expect(result.toString()).toMatch(/^\d+\.\d{1,2}$/);
  });

  it('works for longitude with SNAP_LNG_MIN', () => {
    // 100.5 → nearest grid point from 89 with step 0.4: (100.5 - 89) / 0.4 = 28.75 → rounds to 29
    // 89 + 29 * 0.4 = 89 + 11.6 = 100.6
    expect(snapToGrid(100.5, SNAP_LNG_MIN)).toBe(100.6);
  });
});
