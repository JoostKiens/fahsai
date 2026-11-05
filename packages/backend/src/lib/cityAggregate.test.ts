import { describe, it, expect } from 'vitest';
import {
  cityDay,
  cityTrend,
  lastDays,
  stationDayMeans,
  whoMultiple,
  type Reading,
} from './cityAggregate.js';

const reading = (stationId: string, measuredAt: string, value: number): Reading => ({
  stationId,
  measuredAt,
  value,
});

const STATIONS = [
  { id: 'a', name: 'A', lat: 18.8, lng: 99.0 },
  { id: 'b', name: 'B', lat: 18.7, lng: 99.1 },
  { id: 'c', name: 'C', lat: 18.9, lng: 98.9 },
];

describe('stationDayMeans', () => {
  it('puts a reading on its Bangkok day, not its UTC day', () => {
    // 17:30 UTC on 2 Nov is 00:30 on 3 Nov in Bangkok
    const means = stationDayMeans([reading('a', '2026-11-02T17:30:00Z', 20)]);

    expect(means.get('a')?.get('2026-11-03')).toEqual({ mean: 20, count: 1 });
    expect(means.get('a')?.has('2026-11-02')).toBe(false);
  });

  it('averages the readings of one station on one day', () => {
    const means = stationDayMeans([
      reading('a', '2026-11-03T01:00:00Z', 10),
      reading('a', '2026-11-03T05:00:00Z', 30),
    ]);

    expect(means.get('a')?.get('2026-11-03')).toEqual({ mean: 20, count: 2 });
  });

  it('keeps stations and days apart', () => {
    const means = stationDayMeans([
      reading('a', '2026-11-03T01:00:00Z', 10),
      reading('b', '2026-11-03T01:00:00Z', 50),
      reading('a', '2026-11-04T01:00:00Z', 12),
    ]);

    expect(means.get('b')?.get('2026-11-03')?.mean).toBe(50);
    expect(means.get('a')?.get('2026-11-04')?.mean).toBe(12);
  });
});

describe('cityDay', () => {
  const means = stationDayMeans([
    reading('a', '2026-11-03T01:00:00Z', 10),
    reading('b', '2026-11-03T01:00:00Z', 20.04),
    // c did not report
  ]);

  it('takes the median of the stations that reported, rounded to a whole number', () => {
    expect(cityDay(STATIONS, means, '2026-11-03').pm25).toBe(15);
  });

  it('counts only the stations that reported', () => {
    expect(cityDay(STATIONS, means, '2026-11-03').stationCount).toBe(2);
  });

  it('lists every station in the order given, with null for one that did not report', () => {
    const { stations } = cityDay(STATIONS, means, '2026-11-03');

    expect(stations.map((s) => [s.id, s.pm25, s.readingCount])).toEqual([
      ['a', 10, 1],
      ['b', 20, 1],
      ['c', null, 0],
    ]);
  });

  it('is null, with no stations counted, when nobody reported', () => {
    const none = cityDay(STATIONS, means, '2026-10-01');

    expect(none.pm25).toBeNull();
    expect(none.stationCount).toBe(0);
  });
});

describe('cityTrend', () => {
  it('gives one entry per date, oldest first, with null where no station reported', () => {
    const means = stationDayMeans([
      reading('a', '2026-11-02T01:00:00Z', 10),
      reading('b', '2026-11-02T01:00:00Z', 30),
      reading('a', '2026-11-04T01:00:00Z', 40),
    ]);

    expect(cityTrend(['a', 'b'], means, ['2026-11-02', '2026-11-03', '2026-11-04'])).toEqual([
      { date: '2026-11-02', pm25: 20, stationCount: 2 },
      { date: '2026-11-03', pm25: null, stationCount: 0 },
      { date: '2026-11-04', pm25: 40, stationCount: 1 },
    ]);
  });
});

describe('whoMultiple', () => {
  it.each([
    [15, 1],
    [27, 1.8],
    [0, 0],
  ])('of %d µg/m³ is %d', (pm25, expected) => {
    expect(whoMultiple(pm25)).toBe(expected);
  });

  it('is null without a value', () => {
    expect(whoMultiple(null)).toBeNull();
  });
});

describe('lastDays', () => {
  it('ends on the date and runs oldest first', () => {
    expect(lastDays('2026-11-03', 3)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });

  it('crosses a month boundary', () => {
    expect(lastDays('2026-03-02', 4)).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });
});
