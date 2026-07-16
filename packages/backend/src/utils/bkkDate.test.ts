import { describe, it, expect } from 'vitest';
import { bangkokDateString } from './bkkDate.js';

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
