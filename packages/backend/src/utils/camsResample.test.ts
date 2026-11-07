import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AQ_LAT_COUNT, AQ_LNG_COUNT } from '@thailand-aq/consts';
import { decodeGrib1, type Grib1Message } from './grib1.js';
import { dailyMean, resampleToAqGrid, toMicrograms, type CamsField } from './camsResample.js';

// The ADS grid we request: 64 × 75 cells at 0.4°, from 88.8°E and 30.4°N (north first).
const geometry = { ni: 64, nj: 75, lat1: 30.4, lng1: 88.8, dLat: 0.4, dLng: 0.4 };

function field(valueAt: (col: number, row: number) => number, over = geometry): CamsField {
  const values = new Float64Array(over.ni * over.nj);
  for (let row = 0; row < over.nj; row += 1) {
    for (let col = 0; col < over.ni; col += 1) values[row * over.ni + col] = valueAt(col, row);
  }
  return { ...over, values };
}

function message(leadHour: number, value: number): Grib1Message {
  return { ...field(() => value), leadHour };
}

describe('toMicrograms', () => {
  it('converts kg/m³ to µg/m³', () => {
    const converted = toMicrograms(field(() => 2.5e-8));
    expect(converted.values[0]).toBeCloseTo(25, 9);
  });

  it('keeps the grid geometry', () => {
    expect(toMicrograms(field(() => 1e-8))).toMatchObject(geometry);
  });
});

describe('dailyMean', () => {
  it('averages each cell over the hourly fields', () => {
    const mean = dailyMean([message(5, 10), message(6, 20), message(7, 60)]);
    expect(mean.values[0]).toBeCloseTo(30, 9);
  });

  it('returns the single field unchanged for one message', () => {
    expect(dailyMean([message(5, 7)]).values[100]).toBe(7);
  });

  it('averages the real fixture like a manual mean', () => {
    const grib = readFileSync(new URL('./__fixtures__/cams-pm25-3h.grib', import.meta.url));
    const messages = decodeGrib1(grib);
    const mean = dailyMean(messages);
    const expected = messages.reduce((sum, m) => sum + m.values[1000], 0) / messages.length;
    expect(mean.values[1000]).toBeCloseTo(expected, 15);
  });

  it('throws on two messages for the same lead hour', () => {
    expect(() => dailyMean([message(5, 1), message(5, 2)])).toThrow(/lead hour 5/);
  });

  it('throws when the grids differ', () => {
    const other = { ...message(6, 1), lng1: 89.2 };
    expect(() => dailyMean([message(5, 1), other])).toThrow(/geometry/);
  });

  it('throws on no messages', () => {
    expect(() => dailyMean([])).toThrow(/no messages/);
  });
});

describe('resampleToAqGrid', () => {
  // Value = col + 100 × row, so the mean of four cells around a point is its fractional index.
  const ramp = field((col, row) => col + 100 * row);
  const points = resampleToAqGrid(ramp);

  it('returns the 63 × 73 grid, south-west first', () => {
    expect(points).toHaveLength(AQ_LNG_COUNT * AQ_LAT_COUNT);
    expect(points[0]).toMatchObject({ lat: 1, lng: 89 });
    expect(points[points.length - 1]).toMatchObject({ lat: 29.8, lng: 113.8 });
  });

  it('takes the mean of the four surrounding cells', () => {
    // (lat 1.0, lng 89.0) sits at col 0.5, row (30.4 - 1.0) / 0.4 = 73.5 → cells 0..1 × 73..74.
    expect(points[0].pm25).toBeCloseTo(0.5 + 100 * 73.5, 1);
  });

  it('is not nearest-cell: one hot cell is shared by its four neighbours', () => {
    const spike = resampleToAqGrid(field((col, row) => (col === 5 && row === 40 ? 40 : 0)));
    const hot = spike.filter((p) => p.pm25 > 0);
    expect(hot.map((p) => p.pm25)).toEqual([10, 10, 10, 10]);
  });

  it('rounds to one decimal', () => {
    const third = resampleToAqGrid(field((col, row) => (col === 5 && row === 40 ? 1 : 0)));
    expect(third.find((p) => p.pm25 > 0)?.pm25).toBe(0.3);
  });

  it('throws when the field does not cover the grid edge', () => {
    const narrow = { ...geometry, ni: 63, lng1: 89.2 }; // the spike's original request area
    expect(() => resampleToAqGrid(field(() => 1, narrow))).toThrow(/does not cover/);
  });
});
