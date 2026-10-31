import { describe, it, expect } from 'vitest';
import { camsSummaryPath, camsSummaryRange } from './camsSummary';

describe('camsSummaryRange', () => {
  it('covers the given number of days ending on the latest date', () => {
    expect(camsSummaryRange('2026-10-30', 120)).toEqual({ start: '2026-07-03', end: '2026-10-30' });
    expect(camsSummaryRange('2026-10-30', 30)).toEqual({ start: '2026-10-01', end: '2026-10-30' });
  });
});

describe('camsSummaryPath', () => {
  it('asks the summary route for the range', () => {
    expect(camsSummaryPath({ start: '2026-07-03', end: '2026-10-30' })).toBe(
      '/cams/summary?start=2026-07-03&end=2026-10-30',
    );
  });
});
