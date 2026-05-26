import { describe, it, expect } from 'vitest';
import { staleTimeForArray } from './queryHelpers.js';

const FIVE_MIN_MS = 5 * 60 * 1000;

describe('staleTimeForArray', () => {
  it('returns Infinity for a non-empty array', () => {
    expect(staleTimeForArray({ state: { data: [1, 2, 3] } })).toBe(Infinity);
  });

  it('returns 5 minutes for an empty array', () => {
    expect(staleTimeForArray({ state: { data: [] } })).toBe(FIVE_MIN_MS);
  });

  it('returns 5 minutes when data is null', () => {
    expect(staleTimeForArray({ state: { data: null } })).toBe(FIVE_MIN_MS);
  });

  it('returns 5 minutes when data is undefined', () => {
    expect(staleTimeForArray({ state: {} })).toBe(FIVE_MIN_MS);
  });
});
