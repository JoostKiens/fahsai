import { describe, expect, it } from 'vitest';
import { anchorFactor, FACTOR_MAX, FACTOR_MIN, forecastDays } from './cityForecast.js';

const HOUR_MS = 3_600_000;
// 15:00 UTC is 22:00 in Bangkok: today (24 Nov) has one forecast hour left, 16:00Z (23:00 BKK).
const ISSUED_AT = new Date('2026-11-24T15:00:00Z');

// CAMS hours from the issue hour on, all at the same value
const camsHours = (count: number, pm25 = 20) =>
  Array.from({ length: count }, (_, i) => ({
    validAt: new Date(ISSUED_AT.getTime() + i * HOUR_MS).toISOString(),
    pm25,
  }));

describe('anchorFactor', () => {
  it('scales CAMS by blend over CAMS', () => {
    expect(anchorFactor(30, 20)).toBe(1.5);
  });

  it('clamps the factor at both ends', () => {
    expect(anchorFactor(100, 10)).toBe(FACTOR_MAX);
    expect(anchorFactor(2, 10)).toBe(FACTOR_MIN);
  });

  it('is null without a CAMS value to scale from', () => {
    expect(anchorFactor(30, null)).toBeNull();
    expect(anchorFactor(30, 0)).toBeNull();
  });
});

describe('forecastDays', () => {
  it('gives today, tomorrow and the day after, in Bangkok days', () => {
    const days = forecastDays({ issuedAt: ISSUED_AT, factor: 1.5, cams: camsHours(121) });

    expect(days).toEqual([
      // 16:00Z only (23:00 BKK); the issue hour itself is not a forecast
      { day: '2026-11-24', pm25: 30, hours: 1 },
      { day: '2026-11-25', pm25: 30, hours: 24 },
      { day: '2026-11-26', pm25: 30, hours: 24 },
    ]);
  });

  it('means the hours of a day before scaling', () => {
    const cams = camsHours(48).map((h, i) => ({ ...h, pm25: i % 2 === 0 ? 10 : 30 }));
    const [, tomorrow] = forecastDays({ issuedAt: ISSUED_AT, factor: 2, cams });

    expect(tomorrow.pm25).toBe(40);
  });

  it('leaves out a day the CAMS run does not reach', () => {
    const days = forecastDays({ issuedAt: ISSUED_AT, factor: 1, cams: camsHours(20) });

    expect(days.map((d) => d.day)).toEqual(['2026-11-24', '2026-11-25']);
  });

  it('is empty without CAMS hours', () => {
    expect(forecastDays({ issuedAt: ISSUED_AT, factor: 1, cams: [] })).toEqual([]);
  });
});
