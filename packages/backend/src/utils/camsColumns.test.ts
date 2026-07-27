import { describe, it, expect } from 'vitest';
import { toGridColumns } from './camsColumns.js';

describe('toGridColumns', () => {
  it('returns empty arrays for an empty input', () => {
    expect(toGridColumns([])).toEqual({ lats: [], lngs: [], pm25s: [] });
  });

  it('converts a single point', () => {
    expect(toGridColumns([{ lat: 13.7, lng: 100.5, pm25: 42 }])).toEqual({
      lats: [13.7],
      lngs: [100.5],
      pm25s: [42],
    });
  });

  it('preserves per-index correspondence across multiple points', () => {
    const points: { lat: number; lng: number; pm25: number }[] = [
      { lat: 13.7, lng: 100.5, pm25: 42 },
      { lat: 18.8, lng: 98.9, pm25: 87 },
      { lat: 7.9, lng: 98.3, pm25: 15 },
    ];
    expect(toGridColumns(points)).toEqual({
      lats: [13.7, 18.8, 7.9],
      lngs: [100.5, 98.9, 98.3],
      pm25s: [42, 87, 15],
    });
  });
});
