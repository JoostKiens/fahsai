import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ supabase: {} }));

import { computeP95 } from './cams-summary.js';

describe('computeP95', () => {
  it('throws on empty array', () => {
    expect(() => computeP95([])).toThrow();
  });

  it('single value returns that value', () => {
    expect(computeP95([42])).toBe(42);
  });

  it('returns the maximum for a two-element array', () => {
    expect(computeP95([10, 20])).toBe(20);
  });

  it('returns correct p95 for 20 evenly spaced values', () => {
    // Values 1..20, sorted. index = ceil(0.95 * 20) - 1 = 19 - 1 = 18 → value 19.
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(computeP95(values)).toBe(19);
  });

  it('is order-independent (unsorted input)', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = [10, 3, 7, 1, 5, 9, 2, 6, 8, 4];
    expect(computeP95(shuffled)).toBe(computeP95(sorted));
  });

  it('does not mutate the input array', () => {
    const input = [5, 3, 1, 4, 2];
    const copy = [...input];
    computeP95(input);
    expect(input).toEqual(copy);
  });
});
