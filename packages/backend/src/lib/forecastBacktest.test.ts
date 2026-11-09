import { describe, expect, it } from 'vitest';
import {
  correctForecast,
  direction,
  evaluate,
  pcdBandIndex,
  safeBandIndex,
  type DayPair,
} from './forecastBacktest.js';

describe('pcdBandIndex', () => {
  it('puts each upper bound in its own band', () => {
    expect([15, 25, 37.5, 75].map(pcdBandIndex)).toEqual([0, 1, 2, 3]);
  });

  it('rounds to 0.1 first, so 15.04 is still excellent and 15.05 is not', () => {
    expect([pcdBandIndex(15.04), pcdBandIndex(15.05)]).toEqual([0, 1]);
  });

  it('puts anything above 75 in the last band', () => {
    expect(pcdBandIndex(240)).toBe(4);
  });
});

describe('correctForecast', () => {
  it('scales today by measured/CAMS of yesterday', () => {
    expect(correctForecast({ camsToday: 30, camsPrev: 20, measuredPrev: 30 })).toBe(45);
  });

  it('clamps the ratio at the upper bound', () => {
    expect(correctForecast({ camsToday: 10, camsPrev: 5, measuredPrev: 50 })).toBe(20);
  });

  it('clamps the ratio at the lower bound', () => {
    expect(correctForecast({ camsToday: 40, camsPrev: 100, measuredPrev: 10 })).toBe(20);
  });

  it('returns the raw value when CAMS yesterday is zero', () => {
    expect(correctForecast({ camsToday: 12, camsPrev: 0, measuredPrev: 30 })).toBe(12);
  });
});

describe('safeBandIndex', () => {
  it('never shows a better band than yesterday for a one-band improvement', () => {
    // yesterday 40 (band 3), corrected 30 (band 2): one band better, held back
    expect(safeBandIndex({ corrected: 30, measuredPrev: 40 })).toBe(3);
  });

  it('shows the better band when it is a full two bands better', () => {
    // yesterday 40 (band 3), corrected 20 (band 1)
    expect(safeBandIndex({ corrected: 20, measuredPrev: 40 })).toBe(1);
  });

  it('always shows a worse band', () => {
    expect(safeBandIndex({ corrected: 80, measuredPrev: 20 })).toBe(4);
  });

  it('shows the same band when nothing changes', () => {
    expect(safeBandIndex({ corrected: 38, measuredPrev: 40 })).toBe(3);
  });
});

describe('direction', () => {
  it('calls a change within 15% similar', () => {
    expect(direction({ from: 100, to: 110 })).toBe('similar');
  });

  it('calls a fall of more than 15% better', () => {
    expect(direction({ from: 100, to: 80 })).toBe('better');
  });

  it('calls a rise of more than 15% worse', () => {
    expect(direction({ from: 100, to: 120 })).toBe('worse');
  });
});

describe('evaluate', () => {
  const pair = (overrides: Partial<DayPair>): DayPair => ({
    date: '2026-03-01',
    measured: 40,
    measuredPrev: 40,
    camsToday: 40,
    camsPrev: 40,
    ...overrides,
  });

  it('counts a forecast in a better band than measured as optimistic', () => {
    const { metrics } = evaluate({ pairs: [pair({ camsToday: 20, camsPrev: 40 })] });
    expect(metrics.raw.optimisticRate).toBe(1);
  });

  it('counts a forecast in the same band as an exact hit', () => {
    const { metrics } = evaluate({ pairs: [pair({})] });
    expect(metrics.corrected.exactBandRate).toBe(1);
  });

  it('reports persistence as yesterday’s figure', () => {
    const { metrics } = evaluate({ pairs: [pair({ measured: 60, measuredPrev: 40 })] });
    expect(metrics.persistence.meanBias).toBe(-20);
  });

  it('has no value metrics for the band-only safety variant', () => {
    const { metrics } = evaluate({ pairs: [pair({})] });
    expect(metrics.correctedSafe.meanAbsoluteError).toBeNull();
  });

  it('scores zero days as zero rates', () => {
    const { metrics } = evaluate({ pairs: [] });
    expect(metrics.raw).toMatchObject({ days: 0, exactBandRate: 0, meanBias: null });
  });
});
