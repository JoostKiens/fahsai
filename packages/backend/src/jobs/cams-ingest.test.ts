import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A fake cams_grid table that records the order of writes.
const db = vi.hoisted(() => {
  const writes: string[] = [];
  const state = { deleteError: null as { message: string } | null };
  const from = () => ({
    delete: () => ({
      eq: (column: string, value: string) => {
        writes.push(`delete ${column}=${value}`);
        return Promise.resolve({ error: state.deleteError });
      },
    }),
    upsert: () => {
      writes.push('upsert');
      return Promise.resolve({ error: null });
    },
  });
  return { writes, state, from };
});
vi.mock('../db/client.js', () => ({ supabase: { from: db.from } }));
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
import { computeP95 } from './cams-summary.js';
import { logEgressIp } from '../utils/egressIp.js';
import { fetchAirQualityGrid } from '../utils/openmeteo.js';
import { parseCamsSource, runCamsIngest } from './cams-ingest.js';

describe('parseCamsSource', () => {
  it.each([
    [undefined, 'ads'],
    ['', 'ads'],
    ['openmeteo', 'openmeteo'],
    ['ads', 'ads'],
  ])('reads %j as %s', (value, expected) => {
    expect(parseCamsSource(value)).toBe(expected);
  });

  it('throws on an unknown source, so a typo cannot silently change the source', () => {
    expect(() => parseCamsSource('adss')).toThrow(/invalid CAMS_SOURCE "adss"/);
  });
});

const gridOf = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ lat: 1 + i * 0.001, lng: 89, pm25: 10 }));

describe('runCamsIngest with source "ads"', () => {
  beforeEach(() => {
    vi.mocked(fetchAdsGrid).mockReset();
    vi.mocked(fetchAirQualityGrid).mockReset();
    vi.mocked(computeP95).mockReturnValue(12);
    db.writes.length = 0;
    db.state.deleteError = null;
    vi.stubEnv('ADS_API_KEY', 'test-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('replaces the day: deletes the date first, then writes the grid', async () => {
    vi.mocked(fetchAdsGrid).mockResolvedValue(gridOf(4599));

    await runCamsIngest('2026-11-06', { source: 'ads' });

    expect(db.writes[0]).toBe('delete date=2026-11-06');
    expect(db.writes.slice(1)).toEqual(Array(10).fill('upsert')); // 4,599 rows in batches of 500
  });

  it('does not delete when the grid is incomplete', async () => {
    vi.mocked(fetchAdsGrid).mockResolvedValue(gridOf(3999));

    await runCamsIngest('2026-11-06', { source: 'ads' });

    expect(db.writes).not.toContain('delete date=2026-11-06');
  });

  it('writes nothing when the delete keeps failing', async () => {
    vi.useFakeTimers();
    db.state.deleteError = { message: 'connection reset' };
    vi.mocked(fetchAdsGrid).mockResolvedValue(gridOf(4599));

    const attempt = expect(runCamsIngest('2026-11-06', { source: 'ads' })).rejects.toThrow(
      /delete failed: connection reset/,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await attempt;

    expect(db.writes).not.toContain('upsert');
  });

  it('replaces the day on the Open-Meteo path too, so a half-written ADS day leaves no twins', async () => {
    vi.mocked(fetchAirQualityGrid).mockResolvedValue(gridOf(4599));

    await runCamsIngest('2026-11-06', { source: 'openmeteo' });

    expect(db.writes[0]).toBe('delete date=2026-11-06');
  });

  it('keeps accumulating on the Open-Meteo path when the grid is incomplete', async () => {
    vi.mocked(fetchAirQualityGrid).mockResolvedValue(gridOf(3999));

    await runCamsIngest('2026-11-06', { source: 'openmeteo' });

    expect(db.writes.every((w) => w === 'upsert')).toBe(true);
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

    await runCamsIngest('2026-11-03', { source: 'openmeteo' });

    expect(logEgressIp).toHaveBeenCalledTimes(1);
  });

  it('does not restart the grid when a batch keeps timing out', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.mocked(fetchAirQualityGrid).mockRejectedValue(timeout);

    await expect(runCamsIngest('2026-11-03', { source: 'openmeteo' })).rejects.toBe(timeout);

    expect(fetchAirQualityGrid).toHaveBeenCalledTimes(1);
  });

  it('does not restart the grid when a batch keeps failing to connect', async () => {
    const failure = new TypeError('fetch failed');
    vi.mocked(fetchAirQualityGrid).mockRejectedValue(failure);

    await expect(runCamsIngest('2026-11-03', { source: 'openmeteo' })).rejects.toBe(failure);

    expect(fetchAirQualityGrid).toHaveBeenCalledTimes(1);
  });
});
