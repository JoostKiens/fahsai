import { describe, expect, it } from 'vitest';
import { inverseDistanceMean, withoutOutliers } from './analyzePeers.js';

const readings = (values: number[]) => values.map((pm25) => ({ pm25 }));

describe('withoutOutliers', () => {
  it('drops readings above 2x and below 0.4x the median', () => {
    const kept = withoutOutliers(readings([10, 40, 50, 55, 60, 130]));
    expect(kept.map((r) => r.pm25)).toEqual([40, 50, 55, 60]);
  });

  it('keeps every reading when fewer than 3 would survive', () => {
    const input = readings([5, 50, 200]);
    expect(withoutOutliers(input)).toBe(input);
  });

  it('returns an empty list unchanged', () => {
    expect(withoutOutliers([])).toEqual([]);
  });
});

describe('inverseDistanceMean', () => {
  it('weights near readings more than far ones', () => {
    // weights 1/1 and 1/4: (20*1 + 70*0.25) / 1.25
    expect(
      inverseDistanceMean([
        { pm25: 20, distKm: 1 },
        { pm25: 70, distKm: 4 },
      ]),
    ).toBeCloseTo(30);
  });

  it('floors the distance at 1 km', () => {
    expect(
      inverseDistanceMean([
        { pm25: 20, distKm: 0.1 },
        { pm25: 40, distKm: 1 },
      ]),
    ).toBeCloseTo(30);
  });

  it('returns null for no readings', () => {
    expect(inverseDistanceMean([])).toBeNull();
  });
});
