import { describe, it, expect } from 'vitest';
import { classifyCase } from './classify.js';

const base = {
  isStrongOutlier: false,
  isHighOutlier: false,
  firePressureNorm: 10,
  areaScore: 0,
  camsMaxPm25: 15,
  latestPm25: 35,
  trajectoryPrecipTotal: 5,
  relevantSources: [] as { isUpwind: boolean; distKm: number }[],
  peerWeightedMean: null as number | null,
  originIsWater: false,
};

describe('classifyCase', () => {
  it('returns OUTLIER_HIGH when strong high outlier', () => {
    expect(classifyCase({ ...base, isStrongOutlier: true, isHighOutlier: true })).toBe(
      'OUTLIER_HIGH',
    );
  });

  it('returns OUTLIER_LOW when strong low outlier', () => {
    expect(classifyCase({ ...base, isStrongOutlier: true, isHighOutlier: false })).toBe(
      'OUTLIER_LOW',
    );
  });

  it('returns PLAUSIBLE_FIRE_TRANSPORT when firePressureNorm >= 40 and CAMS not suppressed', () => {
    expect(classifyCase({ ...base, firePressureNorm: 49, camsMaxPm25: 30 })).toBe(
      'PLAUSIBLE_FIRE_TRANSPORT',
    );
  });

  it('does not return PLAUSIBLE_FIRE_TRANSPORT when CAMS suppression active (Chaloem: score 62, camsMax 13)', () => {
    expect(classifyCase({ ...base, firePressureNorm: 62, camsMaxPm25: 13 })).not.toBe(
      'PLAUSIBLE_FIRE_TRANSPORT',
    );
  });

  it('returns PLAUSIBLE_FIRE_TRANSPORT when areaScore >= 40 even with low path score (Mae Sot case)', () => {
    expect(classifyCase({ ...base, firePressureNorm: 10, areaScore: 40, camsMaxPm25: 5 })).toBe(
      'PLAUSIBLE_FIRE_TRANSPORT',
    );
  });

  it('CAMS suppression applies when both path and area fires trigger (Chaloem case: air arrived clean)', () => {
    expect(classifyCase({ ...base, firePressureNorm: 50, areaScore: 50, camsMaxPm25: 5 })).not.toBe(
      'PLAUSIBLE_FIRE_TRANSPORT',
    );
  });

  it('CAMS suppression still applies when triggered by path score alone (areaScore < 40)', () => {
    expect(classifyCase({ ...base, firePressureNorm: 50, areaScore: 10, camsMaxPm25: 5 })).not.toBe(
      'PLAUSIBLE_FIRE_TRANSPORT',
    );
  });

  it('returns PLAUSIBLE_CLEAN for coastal water origin with Moderate reading despite Very high fire pressure (Nakhon Nayok: 28.6, pathScore 78)', () => {
    expect(
      classifyCase({
        ...base,
        latestPm25: 28.6,
        firePressureNorm: 78,
        areaScore: 82,
        camsMaxPm25: 26,
        originIsWater: true,
      }),
    ).toBe('PLAUSIBLE_CLEAN');
  });

  it('does not apply coastal override when reading exceeds Moderate ceiling (35.4)', () => {
    expect(
      classifyCase({ ...base, latestPm25: 36, firePressureNorm: 78, originIsWater: true }),
    ).not.toBe('PLAUSIBLE_CLEAN');
  });

  it('does not apply coastal override when origin is not water', () => {
    expect(
      classifyCase({
        ...base,
        latestPm25: 28.6,
        firePressureNorm: 78,
        areaScore: 82,
        camsMaxPm25: 26,
        originIsWater: false,
      }),
    ).toBe('PLAUSIBLE_FIRE_TRANSPORT');
  });

  it('returns PLAUSIBLE_CLEAN when pm25 <= 12 (Le Thai: 8.6, Narathiwat: 11.6)', () => {
    expect(classifyCase({ ...base, latestPm25: 8.6 })).toBe('PLAUSIBLE_CLEAN');
    expect(classifyCase({ ...base, latestPm25: 11.6 })).toBe('PLAUSIBLE_CLEAN');
  });

  it('returns PLAUSIBLE_CLEAN when pm25 <= 12 even with very high fire pressure (Khong: 9.3, pathScore 78, areaScore 75)', () => {
    expect(
      classifyCase({
        ...base,
        latestPm25: 9.3,
        firePressureNorm: 78,
        areaScore: 75,
        camsMaxPm25: 26,
      }),
    ).toBe('PLAUSIBLE_CLEAN');
  });

  it('returns PLAUSIBLE_CLEAN for washout even with high fire pressure (Ko Yawn: 76.2 mm, 21.9, pathScore 30)', () => {
    expect(
      classifyCase({
        ...base,
        latestPm25: 21.9,
        trajectoryPrecipTotal: 76.2,
        firePressureNorm: 45,
        areaScore: 0,
        camsMaxPm25: 30,
      }),
    ).toBe('PLAUSIBLE_CLEAN');
  });

  it('returns PLAUSIBLE_CLEAN when heavy rain + reading <= 25 (Ko Yawn: 76.2 mm, 21.9 µg/m³)', () => {
    expect(classifyCase({ ...base, trajectoryPrecipTotal: 76.2, latestPm25: 21.9 })).toBe(
      'PLAUSIBLE_CLEAN',
    );
  });

  it('returns PLAUSIBLE_CLEAN for USU (rain-washout branch: 88 mm, 14.4 µg/m³)', () => {
    expect(classifyCase({ ...base, trajectoryPrecipTotal: 88.0, latestPm25: 14.4 })).toBe(
      'PLAUSIBLE_CLEAN',
    );
  });

  it('does not classify as PLAUSIBLE_CLEAN when rain low despite elevated reading (Hana: 1 mm, 37.1)', () => {
    expect(classifyCase({ ...base, trajectoryPrecipTotal: 1.0, latestPm25: 37.1 })).not.toBe(
      'PLAUSIBLE_CLEAN',
    );
  });

  it('returns PLAUSIBLE_URBAN_INDUSTRIAL when upwind source within 150 km', () => {
    const sources = [{ isUpwind: true, distKm: 133 }];
    expect(classifyCase({ ...base, relevantSources: sources })).toBe('PLAUSIBLE_URBAN_INDUSTRIAL');
  });

  it('does not return PLAUSIBLE_URBAN_INDUSTRIAL when upwind source beyond 150 km', () => {
    const sources = [{ isUpwind: true, distKm: 200 }];
    expect(classifyCase({ ...base, relevantSources: sources })).toBe('PLAUSIBLE_UNCLEAR');
  });

  it('returns PLAUSIBLE_REGIONAL_BACKGROUND when consistent with peers and no dominant source', () => {
    // station 35, peers 34 → |35-34|/34 = 2.9% — well within ±40%
    expect(classifyCase({ ...base, peerWeightedMean: 34 })).toBe('PLAUSIBLE_REGIONAL_BACKGROUND');
  });

  it('does not return PLAUSIBLE_REGIONAL_BACKGROUND when station diverges from peers (>40%)', () => {
    // station 35, peers 20 → |35-20|/20 = 75% — above threshold
    expect(classifyCase({ ...base, peerWeightedMean: 20 })).toBe('PLAUSIBLE_UNCLEAR');
  });

  it('returns PLAUSIBLE_UNCLEAR when no upwind sources and no clear cause', () => {
    expect(classifyCase({ ...base })).toBe('PLAUSIBLE_UNCLEAR');
  });
});
