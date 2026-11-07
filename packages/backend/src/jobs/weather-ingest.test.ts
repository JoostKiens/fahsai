import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));
vi.mock('../cache/client.js', () => ({ HISTORICAL_TTL_SECONDS: 604_800 }));
vi.mock('../cache/safe.js', () => ({ cacheReplace: vi.fn() }));
vi.mock('../utils/computeStationWeather.js', () => ({ precomputeStationWeather: vi.fn() }));
vi.mock('../utils/egressIp.js', () => ({ logEgressIp: vi.fn() }));
vi.mock('../utils/openmeteo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/openmeteo.js')>()),
  fetchWeatherGridForDate: vi.fn(),
}));

import { logEgressIp } from '../utils/egressIp.js';
import { fetchWeatherGridForDate } from '../utils/openmeteo.js';
import { runWeatherIngest } from './weather-ingest.js';

describe('runWeatherIngest', () => {
  beforeEach(() => {
    vi.mocked(fetchWeatherGridForDate).mockReset();
    vi.mocked(logEgressIp).mockClear();
  });

  it('looks up the egress IP once per run', async () => {
    vi.mocked(fetchWeatherGridForDate).mockResolvedValue([]);

    await runWeatherIngest('2026-11-03');

    expect(logEgressIp).toHaveBeenCalledTimes(1);
  });

  it('passes one timeout retry budget to the grid fetch', async () => {
    vi.mocked(fetchWeatherGridForDate).mockResolvedValue([]);

    await runWeatherIngest('2026-11-03');

    const [, options] = vi.mocked(fetchWeatherGridForDate).mock.calls[0];
    // A real budget with its one retry still unspent.
    expect(options.timeoutRetryBudget?.tryUse()).toBe(true);
    expect(options.timeoutRetryBudget?.tryUse()).toBe(false);
  });

  it('does not restart the grid when a batch keeps timing out', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.mocked(fetchWeatherGridForDate).mockRejectedValue(timeout);

    await expect(runWeatherIngest('2026-11-03')).rejects.toBe(timeout);

    expect(fetchWeatherGridForDate).toHaveBeenCalledTimes(1);
  });
});
