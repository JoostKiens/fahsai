import { describe, it, expect } from 'vitest';
import { getRelevantUrbanSources } from './urbanSources.js';

// Bangkok as the reference station for most tests
const BKK_LAT = 13.756;
const BKK_LNG = 100.502;

// Sources near Bangkok (within 300 km):
//   Nonthaburi  — ~12 km NNE (bearing ≈ 9°)
//   Samut Prakan — ~25 km SE  (bearing ≈ 130°)
//   Nakhon Ratchasima — ~255 km NE (bearing ≈ 55°)

describe('getRelevantUrbanSources', () => {
  it('marks a source directly upwind as isUpwind: true', () => {
    // Wind from N (0°) → Nonthaburi is NNE (bearing ≈ 9°), diff ≈ 9° < 60° → upwind
    const results = getRelevantUrbanSources(BKK_LAT, BKK_LNG, 0, {
      maxDistanceKm: 300,
      toleranceDeg: 60,
      minInfluenceScore: 0,
    });
    const nonthaburi = results.find((s) => s.name === 'Nonthaburi');
    expect(nonthaburi).toBeDefined();
    expect(nonthaburi!.isUpwind).toBe(true);
  });

  it('marks a source directly downwind as isUpwind: false', () => {
    // Wind from N (0°) → Samut Prakan is SE (bearing ≈ 130°), diff ≈ 130° > 60° → not upwind
    const results = getRelevantUrbanSources(BKK_LAT, BKK_LNG, 0, {
      maxDistanceKm: 300,
      toleranceDeg: 60,
      minInfluenceScore: 0,
    });
    const samutPrakan = results.find((s) => s.name === 'Samut Prakan');
    expect(samutPrakan).toBeDefined();
    expect(samutPrakan!.isUpwind).toBe(false);
  });

  it('marks a source at exactly toleranceDeg boundary as isUpwind: true', () => {
    // Nonthaburi bearing from Bangkok ≈ 9°.
    // Set windDirectionDeg = 9 + 60 = 69 → diff = exactly 60° → should be upwind (inclusive).
    const results = getRelevantUrbanSources(BKK_LAT, BKK_LNG, 69, {
      maxDistanceKm: 300,
      toleranceDeg: 60,
      minInfluenceScore: 0,
    });
    const nonthaburi = results.find((s) => s.name === 'Nonthaburi');
    expect(nonthaburi).toBeDefined();
    expect(nonthaburi!.isUpwind).toBe(true);
  });

  it('excludes sources beyond maxDistanceKm', () => {
    // Nakhon Ratchasima is ~255 km from Bangkok — excluded at maxDistanceKm: 200
    const results = getRelevantUrbanSources(BKK_LAT, BKK_LNG, null, {
      maxDistanceKm: 200,
      minInfluenceScore: 0,
    });
    const korat = results.find((s) => s.name === 'Nakhon Ratchasima');
    expect(korat).toBeUndefined();
  });

  it('excludes sources below minInfluenceScore', () => {
    // Nakhon Ratchasima: pop=600_000, dist≈255km → score ≈ 600_000/65_025 ≈ 9.
    // Excluded when minInfluenceScore = 100.
    const results = getRelevantUrbanSources(BKK_LAT, BKK_LNG, null, {
      maxDistanceKm: 300,
      minInfluenceScore: 100,
    });
    const korat = results.find((s) => s.name === 'Nakhon Ratchasima');
    expect(korat).toBeUndefined();
  });

  it('sets isUpwind: false for all sources when windDirectionDeg is null', () => {
    const results = getRelevantUrbanSources(BKK_LAT, BKK_LNG, null, {
      maxDistanceKm: 300,
      minInfluenceScore: 0,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((s) => s.isUpwind === false)).toBe(true);
  });

  it('returns results sorted by influenceScore descending', () => {
    const results = getRelevantUrbanSources(BKK_LAT, BKK_LNG, null, {
      maxDistanceKm: 300,
      minInfluenceScore: 0,
    });
    expect(results.length).toBeGreaterThan(1);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].influenceScore).toBeGreaterThanOrEqual(results[i].influenceScore);
    }
  });

  it('handles wrap-around: wind from 350°, source bearing ~0° → isUpwind: true (diff ≈ 10°)', () => {
    // Ho Chi Minh City as station, Hanoi is roughly due north (bearing ≈ 0°).
    // Wind from 350° → diff = |((0 - 350 + 540) % 360) - 180| = |190 - 180| = 10° < 60° → upwind.
    const hcmcLat = 10.823;
    const hcmcLng = 106.63;
    const results = getRelevantUrbanSources(hcmcLat, hcmcLng, 350, {
      maxDistanceKm: 1500,
      toleranceDeg: 60,
      minInfluenceScore: 0,
    });
    const hanoi = results.find((s) => s.name === 'Hanoi');
    expect(hanoi).toBeDefined();
    expect(hanoi!.isUpwind).toBe(true);
  });

  it('influenceScore equals population / distanceKm²', () => {
    const results = getRelevantUrbanSources(BKK_LAT, BKK_LNG, null, {
      maxDistanceKm: 300,
      minInfluenceScore: 0,
    });
    for (const s of results) {
      expect(s.influenceScore).toBeCloseTo(s.population / s.distanceKm ** 2, 5);
    }
  });
});
