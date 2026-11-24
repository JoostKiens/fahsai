import { describe, expect, it } from 'vitest';
import { findCity } from '../data/cities.js';
import { footprintCellWeights, footprintValue, type CamsGridShape } from './cityCams.js';

// The grid the ADS returns for CAMS_AREA (decoded from utils/__fixtures__/cams-pm25-3h.grib).
const GRID: CamsGridShape = { ni: 64, nj: 75, lat1: 30.4, lng1: 88.8, dLat: 0.4, dLng: 0.4 };

const totalWeight = (cells: { weight: number }[]) => cells.reduce((sum, c) => sum + c.weight, 0);

describe('footprintCellWeights', () => {
  it('splits Chiang Mai about 55/45 over the two cells at 18.8°N', () => {
    const chiangMai = findCity('chiang-mai');
    if (chiangMai === undefined) throw new Error('chiang-mai is not in CITIES');

    const cells = footprintCellWeights(chiangMai, GRID);

    expect(cells.map(({ lat, lng }) => [lat.toFixed(1), lng.toFixed(1)])).toEqual([
      ['18.8', '98.8'],
      ['18.8', '99.2'],
    ]);
    expect(cells[0].weight).toBeGreaterThan(0.52);
    expect(cells[0].weight).toBeLessThan(0.58);
  });

  it('gives weights that sum to 1', () => {
    const cells = footprintCellWeights({ lat: 13.7563, lng: 100.5018, radiusKm: 20 }, GRID);

    expect(totalWeight(cells)).toBeCloseTo(1, 10);
  });

  it('gives one cell all the weight when a small circle sits on its grid point', () => {
    const cells = footprintCellWeights({ lat: 18.8, lng: 99.2, radiusKm: 5 }, GRID);

    expect(cells).toHaveLength(1);
    expect(cells[0].weight).toBe(1);
  });

  it('shares a circle on the corner of four cells about equally', () => {
    const cells = footprintCellWeights({ lat: 18.6, lng: 99.0, radiusKm: 10 }, GRID);

    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell.weight).toBeCloseTo(0.25, 2);
  });

  it('throws when the footprint leaves the grid', () => {
    expect(() => footprintCellWeights({ lat: 0.7, lng: 100, radiusKm: 20 }, GRID)).toThrow(
      /off the grid/,
    );
  });
});

describe('footprintValue', () => {
  it('weights each cell value by its share', () => {
    const values = new Float64Array([10, 20, 30]);
    const weights = [
      { index: 0, lat: 0, lng: 0, weight: 0.75 },
      { index: 2, lat: 0, lng: 0, weight: 0.25 },
    ];

    expect(footprintValue(values, weights)).toBe(15);
  });
});
