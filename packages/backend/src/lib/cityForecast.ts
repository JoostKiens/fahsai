import { bangkokDateString } from '../utils/bkkDate.js';

// The anchor factor's clamp: the backtest's "corrected" method (JOO-122), too optimistic on 20% of
// days against 47% for raw CAMS. Wider would let one odd hour swing a three-day forecast.
export const FACTOR_MIN = 0.5;
export const FACTOR_MAX = 2;
// Today (its hours still to come) and the two days after, in Bangkok time.
export const FORECAST_DAYS = 3;

const DAY_MS = 24 * 3_600_000;

/**
 * How much to scale CAMS by: the latest hour's blend over CAMS for that hour, clamped. Null when
 * there is no CAMS value to scale from.
 */
export function anchorFactor(blendPm25: number, camsPm25: number | null): number | null {
  if (camsPm25 === null || camsPm25 <= 0) return null;
  return Math.min(FACTOR_MAX, Math.max(FACTOR_MIN, blendPm25 / camsPm25));
}

export type ForecastDay = { day: string; pm25: number; hours: number };

/**
 * The forecast per Bangkok day: the mean of the CAMS hours after issuedAt, times the factor. Today
 * counts only the hours still to come; a day without CAMS hours is left out.
 */
export function forecastDays({
  issuedAt,
  factor,
  cams,
}: {
  issuedAt: Date;
  factor: number;
  cams: readonly { validAt: string; pm25: number }[];
}): ForecastDay[] {
  const days = Array.from({ length: FORECAST_DAYS }, (_, i) =>
    bangkokDateString(issuedAt.getTime() + i * DAY_MS),
  );
  const byDay = new Map<string, number[]>(days.map((day) => [day, []]));
  for (const hour of cams) {
    if (Date.parse(hour.validAt) <= issuedAt.getTime()) continue;
    byDay.get(bangkokDateString(new Date(hour.validAt)))?.push(hour.pm25);
  }
  return days.flatMap((day) => {
    const values = byDay.get(day) ?? [];
    if (values.length === 0) return [];
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return [{ day, pm25: mean * factor, hours: values.length }];
  });
}
