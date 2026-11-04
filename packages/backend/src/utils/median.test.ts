import { describe, it, expect } from 'vitest';
import { median } from './median.js';

describe('median', () => {
  it.each([
    [[3, 1, 2], 2],
    [[4, 1, 3, 2], 2.5],
    [[7], 7],
  ])('of %j is %d', (values, expected) => {
    expect(median(values)).toBe(expected);
  });

  it('is null for nothing', () => {
    expect(median([])).toBeNull();
  });

  it('does not reorder the values it is given', () => {
    const values = [3, 1, 2];

    median(values);

    expect(values).toEqual([3, 1, 2]);
  });
});
