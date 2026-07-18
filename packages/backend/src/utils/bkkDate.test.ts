import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  bangkokDateString,
  getYesterdayBkk,
  bangkokMidnightIso,
  bangkokMidnightUtcMs,
} from './bkkDate.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('bangkokDateString', () => {
  it('returns the Bangkok day, not the UTC day, near a UTC day boundary', () => {
    // 23:30 UTC on 2026-07-15 is 06:30 BKK on 2026-07-16.
    expect(bangkokDateString(new Date('2026-07-15T23:30:00Z'))).toBe('2026-07-16');
  });

  it('returns the same day as UTC when well inside the UTC day', () => {
    // 04:00 UTC is 11:00 BKK, same calendar day in both zones.
    expect(bangkokDateString(new Date('2026-07-15T04:00:00Z'))).toBe('2026-07-15');
  });

  it('accepts an epoch millisecond number', () => {
    expect(bangkokDateString(Date.parse('2026-07-15T23:30:00Z'))).toBe('2026-07-16');
  });
});

describe('getYesterdayBkk', () => {
  it('returns the Bangkok day, not the UTC day, near a UTC day boundary', () => {
    // 23:30 UTC on 2026-07-15 is 06:30 BKK on 2026-07-16, so BKK-yesterday is
    // 2026-07-15 — one day later than a UTC-based "yesterday" calc (2026-07-14).
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

describe('bangkokMidnightIso', () => {
  it('appends the Bangkok UTC+7 offset to the date string', () => {
    expect(bangkokMidnightIso('2026-07-16')).toBe('2026-07-16T00:00:00+07:00');
  });

  it('parses to the same instant as bangkokMidnightUtcMs', () => {
    expect(Date.parse(bangkokMidnightIso('2026-07-16'))).toBe(bangkokMidnightUtcMs('2026-07-16'));
  });
});

describe('bangkokMidnightUtcMs', () => {
  it('is the inverse of bangkokDateString: round-trips back to the same date', () => {
    const ms = bangkokMidnightUtcMs('2026-07-16');
    expect(bangkokDateString(ms)).toBe('2026-07-16');
  });

  it('returns the UTC instant 7 hours before the naive UTC-midnight of the same date', () => {
    // BKK midnight on 2026-07-16 is 2026-07-15T17:00:00.000Z, not 2026-07-16T00:00:00.000Z.
    expect(bangkokMidnightUtcMs('2026-07-16')).toBe(Date.parse('2026-07-15T17:00:00.000Z'));
  });
});
