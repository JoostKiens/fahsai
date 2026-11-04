import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));
vi.mock('../cache/client.js', () => ({ HISTORICAL_TTL_SECONDS: 604_800 }));
vi.mock('../cache/safe.js', () => ({ cacheReplace: vi.fn() }));
vi.mock('../utils/computeStationWeather.js', () => ({ precomputeStationWeather: vi.fn() }));
vi.mock('../utils/openmeteo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/openmeteo.js')>()),
  fetchWeatherGridForDate: vi.fn(),
}));

import { fetchWeatherGridForDate } from '../utils/openmeteo.js';
import { runWeatherIngest } from './weather-ingest.js';

describe('runWeatherIngest', () => {
  beforeEach(() => {
    vi.mocked(fetchWeatherGridForDate).mockReset();
  });

  it('does not restart the grid when a batch keeps timing out', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.mocked(fetchWeatherGridForDate).mockRejectedValue(timeout);

    await expect(runWeatherIngest('2026-11-03')).rejects.toBe(timeout);

    expect(fetchWeatherGridForDate).toHaveBeenCalledTimes(1);
  });
});
