import { describe, it, expect, vi, afterEach } from 'vitest';

// vi.mock is hoisted before imports by Vitest — prevents db/client.ts and
// cache/client.ts from throwing when their env vars are absent in tests.
vi.mock('../db/client.js', () => ({ supabase: {} }));
vi.mock('../cache/client.js', () => ({ redis: {}, HISTORICAL_TTL_SECONDS: 604800 }));

import { getYesterdayBkk } from './weather-ingest.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('getYesterdayBkk', () => {
  it('returns the Bangkok day, not the UTC day, near a UTC day boundary', () => {
    // 23:30 UTC on 2026-07-15 is 06:30 BKK on 2026-07-16, so BKK-yesterday is
    // 2026-07-15 — one day later than the UTC-based calc this replaced (2026-07-14).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T23:30:00Z'));
    expect(getYesterdayBkk()).toBe('2026-07-15');
  });

  it('returns the same day as a UTC-based calc when well inside the UTC day', () => {
    // 04:00 UTC is 11:00 BKK, same calendar day in both zones.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T04:00:00Z'));
    expect(getYesterdayBkk()).toBe('2026-07-14');
  });
});
