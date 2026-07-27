import { describe, it, expect } from 'vitest';
import { zipGridColumns, parseCamsGridResponse } from './camsColumns';

describe('zipGridColumns', () => {
  it('returns an empty array for empty columns', () => {
    expect(zipGridColumns({ lats: [], lngs: [], pm25s: [] })).toEqual([]);
  });

  it('zips columns back into PM25GridPoint[] by index', () => {
    const columns = {
      lats: [13.7, 18.8, 7.9],
      lngs: [100.5, 98.9, 98.3],
      pm25s: [42, 87, 15],
    };
    expect(zipGridColumns(columns)).toEqual([
      { lat: 13.7, lng: 100.5, pm25: 42 },
      { lat: 18.8, lng: 98.9, pm25: 87 },
      { lat: 7.9, lng: 98.3, pm25: 15 },
    ]);
  });
});

describe('parseCamsGridResponse', () => {
  it('zips columns when given the new columnar shape', () => {
    const columns = { lats: [13.7], lngs: [100.5], pm25s: [42] };
    expect(parseCamsGridResponse(columns)).toEqual([{ lat: 13.7, lng: 100.5, pm25: 42 }]);
  });

  it('passes an array through unchanged when given the old PM25GridPoint[] shape', () => {
    const points = [{ lat: 13.7, lng: 100.5, pm25: 42 }];
    expect(parseCamsGridResponse(points)).toBe(points);
  });
});
