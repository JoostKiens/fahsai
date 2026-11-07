import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));
vi.mock('../cache/client.js', () => ({ HISTORICAL_TTL_SECONDS: 604_800 }));
vi.mock('../cache/safe.js', () => ({ cacheReplace: vi.fn() }));
vi.mock('./cams-summary.js', () => ({ computeP95: vi.fn(), upsertCamsDailySummary: vi.fn() }));
vi.mock('../utils/egressIp.js', () => ({ logEgressIp: vi.fn() }));
vi.mock('../utils/camsAdsGrid.js', () => ({ fetchAdsGrid: vi.fn() }));
vi.mock('../utils/openmeteo.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/openmeteo.js')>()),
  fetchAirQualityGrid: vi.fn(),
}));

import { fetchAdsGrid } from '../utils/camsAdsGrid.js';
import { logEgressIp } from '../utils/egressIp.js';
import { fetchAirQualityGrid } from '../utils/openmeteo.js';
import { parseCamsSource, runCamsIngest } from './cams-ingest.js';

describe('parseCamsSource', () => {
  it.each([
    [undefined, 'openmeteo'],
    ['', 'openmeteo'],
    ['openmeteo', 'openmeteo'],
    ['ads', 'ads'],
  ])('reads %j as %s', (value, expected) => {
    expect(parseCamsSource(value)).toBe(expected);
  });

  it('throws on an unknown source, so a typo cannot silently change the source', () => {
    expect(() => parseCamsSource('adss')).toThrow(/invalid CAMS_SOURCE "adss"/);
  });
});

describe('runCamsIngest with source "ads"', () => {
  beforeEach(() => {
    vi.mocked(fetchAdsGrid).mockReset();
    vi.mocked(fetchAirQualityGrid).mockReset();
    vi.stubEnv('ADS_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fetches from the ADS and makes no Open-Meteo calls', async () => {
    vi.mocked(fetchAdsGrid).mockResolvedValue([]);

    await runCamsIngest('2026-11-06', { source: 'ads' });

    expect(fetchAdsGrid).toHaveBeenCalledWith('2026-11-06', 'test-key');
    expect(fetchAirQualityGrid).not.toHaveBeenCalled();
  });

  it('fails before any request when ADS_API_KEY is missing', async () => {
    vi.stubEnv('ADS_API_KEY', '');

    await expect(runCamsIngest('2026-11-06', { source: 'ads' })).rejects.toThrow(/ADS_API_KEY/);
    expect(fetchAdsGrid).not.toHaveBeenCalled();
  });

  it('does not start over when the ADS fetch fails', async () => {
    const failure = new Error('ADS job failed: forecast not yet available');
    vi.mocked(fetchAdsGrid).mockRejectedValue(failure);

    await expect(runCamsIngest('2026-11-06', { source: 'ads' })).rejects.toBe(failure);

    expect(fetchAdsGrid).toHaveBeenCalledTimes(1);
  });
});

describe('runCamsIngest', () => {
  beforeEach(() => {
    vi.mocked(fetchAirQualityGrid).mockReset();
    vi.mocked(logEgressIp).mockClear();
  });

  it('looks up the egress IP once per run', async () => {
    vi.mocked(fetchAirQualityGrid).mockResolvedValue([]);

    await runCamsIngest('2026-11-03');

    expect(logEgressIp).toHaveBeenCalledTimes(1);
  });

  it('does not restart the grid when a batch keeps timing out', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.mocked(fetchAirQualityGrid).mockRejectedValue(timeout);

    await expect(runCamsIngest('2026-11-03')).rejects.toBe(timeout);

    expect(fetchAirQualityGrid).toHaveBeenCalledTimes(1);
  });

  it('does not restart the grid when a batch keeps failing to connect', async () => {
    const failure = new TypeError('fetch failed');
    vi.mocked(fetchAirQualityGrid).mockRejectedValue(failure);

    await expect(runCamsIngest('2026-11-03')).rejects.toBe(failure);

    expect(fetchAirQualityGrid).toHaveBeenCalledTimes(1);
  });
});
