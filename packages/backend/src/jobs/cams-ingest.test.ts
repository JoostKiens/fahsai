import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));
vi.mock('../cache/client.js', () => ({ HISTORICAL_TTL_SECONDS: 604_800 }));
vi.mock('../cache/safe.js', () => ({ cacheReplace: vi.fn() }));
vi.mock('./cams-summary.js', () => ({ computeP95: vi.fn(), upsertCamsDailySummary: vi.fn() }));
vi.mock('../utils/openmeteo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/openmeteo.js')>()),
  fetchAirQualityGrid: vi.fn(),
}));

import { fetchAirQualityGrid } from '../utils/openmeteo.js';
import { runCamsIngest } from './cams-ingest.js';

describe('runCamsIngest', () => {
  beforeEach(() => {
    vi.mocked(fetchAirQualityGrid).mockReset();
  });

  it('does not restart the grid when a batch keeps timing out', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.mocked(fetchAirQualityGrid).mockRejectedValue(timeout);

    await expect(runCamsIngest('2026-11-03')).rejects.toBe(timeout);

    expect(fetchAirQualityGrid).toHaveBeenCalledTimes(1);
  });
});
