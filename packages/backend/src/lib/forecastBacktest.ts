// Pure maths for the JOO-122 forecast backtest (scripts/backtest-forecast.ts). No I/O.

// Upper bounds (µg/m³) of the first four Thai PCD bands; a fifth, open-ended band follows.
// Copied from packages/frontend/src/utils/pcdBands.ts: the backend has no PCD scale of its own.
const PCD_UPPER_BOUNDS = [15.0, 25.0, 37.5, 75.0];

export type Clamp = { min: number; max: number };

export const DEFAULT_CLAMP: Clamp = { min: 0.5, max: 2 };

/** A ratio further than this from 1 counts as better/worse; inside it is "similar". */
export const SIMILAR_RATIO_TOLERANCE = 0.15;

export type Direction = 'better' | 'similar' | 'worse';

export type DayPair = {
  date: string;
  /** City figure for the day: median of station daily means */
  measured: number;
  measuredPrev: number;
  camsToday: number;
  camsPrev: number;
};

export type Method = 'raw' | 'corrected' | 'correctedSafe' | 'persistence';

export type MethodMetrics = {
  days: number;
  exactBandRate: number;
  withinOneBandRate: number;
  /** Predicted band better (lower) than the measured one */
  optimisticRate: number;
  /** Predicted band worse (higher) than the measured one */
  pessimisticRate: number;
  /** Mean of (predicted - measured) in µg/m³; null where the method predicts a band only */
  meanBias: number | null;
  meanAbsoluteError: number | null;
};

export type BacktestResult = {
  metrics: Record<Method, MethodMetrics>;
  /** Share of days where CAMS(D) vs CAMS(D-1) gave the same direction as the measurements */
  directionHitRate: number;
};

/** 0 = excellent ... 4 = very unhealthy. Rounds to 0.1 first, as pm25ToPcdBand does. */
export function pcdBandIndex(pm25: number): number {
  const rounded = Math.round(pm25 * 10) / 10;
  const index = PCD_UPPER_BOUNDS.findIndex((upperBound) => rounded <= upperBound);
  return index === -1 ? PCD_UPPER_BOUNDS.length : index;
}

/**
 * Scales today's CAMS value by yesterday's measured/CAMS ratio, clamped. With no usable ratio
 * (CAMS yesterday is zero) the raw value is returned.
 */
export function correctForecast({
  camsToday,
  camsPrev,
  measuredPrev,
  clamp = DEFAULT_CLAMP,
}: {
  camsToday: number;
  camsPrev: number;
  measuredPrev: number;
  clamp?: Clamp;
}): number {
  if (camsPrev <= 0) return camsToday;
  const ratio = Math.min(Math.max(measuredPrev / camsPrev, clamp.min), clamp.max);
  return camsToday * ratio;
}

/**
 * Safety rule: the shown band is never better than yesterday's measured band, unless the
 * corrected forecast is at least `minBandsBetter` bands better. Worse is always shown.
 * Returns a band index.
 */
export function safeBandIndex({
  corrected,
  measuredPrev,
  minBandsBetter = 2,
}: {
  corrected: number;
  measuredPrev: number;
  minBandsBetter?: number;
}): number {
  const correctedBand = pcdBandIndex(corrected);
  const prevBand = pcdBandIndex(measuredPrev);
  const bandsBetter = prevBand - correctedBand;
  return bandsBetter > 0 && bandsBetter < minBandsBetter ? prevBand : correctedBand;
}

export function direction({ from, to }: { from: number; to: number }): Direction {
  if (from <= 0) return 'similar';
  const ratio = to / from;
  if (ratio < 1 - SIMILAR_RATIO_TOLERANCE) return 'better';
  if (ratio > 1 + SIMILAR_RATIO_TOLERANCE) return 'worse';
  return 'similar';
}

type Prediction = { bandIndex: number; value: number | null };

function metricsFor(pairs: DayPair[], predictions: Prediction[]): MethodMetrics {
  const total = pairs.length;
  const bandDiffs = pairs.map((pair, i) => predictions[i].bandIndex - pcdBandIndex(pair.measured));
  const rate = (count: number) => (total === 0 ? 0 : count / total);
  const errors = pairs.flatMap((pair, i) => {
    const value = predictions[i].value;
    return value === null ? [] : [value - pair.measured];
  });
  const mean = (values: number[]) =>
    values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;
  return {
    days: total,
    exactBandRate: rate(bandDiffs.filter((d) => d === 0).length),
    withinOneBandRate: rate(bandDiffs.filter((d) => Math.abs(d) <= 1).length),
    optimisticRate: rate(bandDiffs.filter((d) => d < 0).length),
    pessimisticRate: rate(bandDiffs.filter((d) => d > 0).length),
    meanBias: mean(errors),
    meanAbsoluteError: mean(errors.map(Math.abs)),
  };
}

export function evaluate({
  pairs,
  clamp = DEFAULT_CLAMP,
  minBandsBetter = 2,
}: {
  pairs: DayPair[];
  clamp?: Clamp;
  minBandsBetter?: number;
}): BacktestResult {
  const corrected = pairs.map((pair) => correctForecast({ ...pair, clamp }));
  const withValue = (values: number[]): Prediction[] =>
    values.map((value) => ({ bandIndex: pcdBandIndex(value), value }));

  const directionHits = pairs.filter(
    (pair) =>
      direction({ from: pair.camsPrev, to: pair.camsToday }) ===
      direction({ from: pair.measuredPrev, to: pair.measured }),
  ).length;

  return {
    metrics: {
      raw: metricsFor(pairs, withValue(pairs.map((pair) => pair.camsToday))),
      corrected: metricsFor(pairs, withValue(corrected)),
      correctedSafe: metricsFor(
        pairs,
        pairs.map((pair, i) => ({
          bandIndex: safeBandIndex({
            corrected: corrected[i],
            measuredPrev: pair.measuredPrev,
            minBandsBetter,
          }),
          value: null,
        })),
      ),
      persistence: metricsFor(pairs, withValue(pairs.map((pair) => pair.measuredPrev))),
    },
    directionHitRate: pairs.length === 0 ? 0 : directionHits / pairs.length,
  };
}
