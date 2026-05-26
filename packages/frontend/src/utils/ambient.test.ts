// packages/frontend/src/utils/ambient.test.ts
import { describe, it, expect } from 'vitest';
import { degToCompass, findNearestAQPoint, findNearestWind } from './ambient.js';
import type { PM25GridPoint, WindReading } from '@thailand-aq/types';

describe('degToCompass', () => {
  it('returns N for 0°', () => {
    expect(degToCompass(0)).toBe('N');
  });

  it('returns E for 90°', () => {
    expect(degToCompass(90)).toBe('E');
  });

  it('returns S for 180°', () => {
    expect(degToCompass(180)).toBe('S');
  });

  it('returns W for 270°', () => {
    expect(degToCompass(270)).toBe('W');
  });

  it('wraps 360° back to N', () => {
    expect(degToCompass(360)).toBe('N');
  });

  it('handles negative degrees: −90° → W', () => {
    expect(degToCompass(-90)).toBe('W');
  });
});

describe('findNearestAQPoint', () => {
  const grid: PM25GridPoint[] = [
    { lat: 10, lng: 100, pm25: 15 },
    { lat: 15, lng: 100, pm25: 30 },
    { lat: 10, lng: 105, pm25: 50 },
  ];

  it('returns null for an empty grid', () => {
    expect(findNearestAQPoint([], 100, 10)).toBeNull();
  });

  it('returns the single point when grid has one entry', () => {
    expect(findNearestAQPoint([grid[0]], 999, 999)).toEqual(grid[0]);
  });

  it('returns the closest point by Euclidean distance', () => {
    // Query at (lng=100, lat=10) — exactly on grid[0]
    expect(findNearestAQPoint(grid, 100, 10)).toEqual(grid[0]);
  });

  it('picks the point closest in longitude', () => {
    // Query at (lng=104, lat=10) — closer to grid[2] (lng=105) than grid[0] (lng=100)
    expect(findNearestAQPoint(grid, 104, 10)).toEqual(grid[2]);
  });
});

describe('findNearestWind', () => {
  const vectors: WindReading[] = [
    { lat: 13, lng: 100, wind_speed_kmh: 10, wind_direction_deg: 0 },
    { lat: 18, lng: 99, wind_speed_kmh: 20, wind_direction_deg: 90 },
  ];

  it('returns null for an empty array', () => {
    expect(findNearestWind([], 100, 13)).toBeNull();
  });

  it('returns the closest vector', () => {
    // Query at (lng=100, lat=13) — exactly on vectors[0]
    expect(findNearestWind(vectors, 100, 13)).toEqual(vectors[0]);
  });

  it('returns the farther vector when query is near it', () => {
    // Query at (lng=99, lat=18) — exactly on vectors[1]
    expect(findNearestWind(vectors, 99, 18)).toEqual(vectors[1]);
  });
});
