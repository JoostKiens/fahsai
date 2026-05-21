import { describe, it, expect } from 'vitest';
import { traceEnsemble, offsetDate, nearestGridPoint } from './trajectory.js';
import { haversineKm, bearingDeg } from '../lib/geo.js';
import type { WindGridPoint } from './trajectory.js';

// Minimal single-point wind grid
function makeGrid(lat: number, lng: number, speed: number, dir: number): WindGridPoint[] {
  return [{ lat, lng, wind_speed_kmh: speed, wind_direction_deg: dir }];
}

describe('offsetDate', () => {
  it('handles leap year correctly', () => {
    expect(offsetDate('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('crosses year boundary', () => {
    expect(offsetDate('2024-01-01', -1)).toBe('2023-12-31');
  });
});

describe('nearestGridPoint', () => {
  it('returns the closest point', () => {
    const grid: WindGridPoint[] = [
      { lat: 10, lng: 100, wind_speed_kmh: 5, wind_direction_deg: 0 },
      { lat: 20, lng: 100, wind_speed_kmh: 10, wind_direction_deg: 90 },
    ];
    const result = nearestGridPoint(11, 100, grid);
    expect(result.lat).toBe(10);
  });
});

describe('traceEnsemble', () => {
  const stationLat = 18.79;
  const stationLng = 98.99;
  const date = '2024-03-15';

  it('always returns 5 members', () => {
    const grid = makeGrid(stationLat, stationLng, 20, 0);
    const map = new Map([[date, grid]]);
    const result = traceEnsemble(stationLat, stationLng, date, map);
    expect(result.members.length).toBe(5);
  });

  it('single step: wind from North moves origin southward', () => {
    // Wind from North (0°) → air travels South → tracing backward moves North
    // But wait: backward trace goes opposite to travel direction
    // Wind FROM north means air came from north → origin is north of station
    const grid = makeGrid(stationLat, stationLng, 100, 0); // 100 km/h from North
    const map = new Map([[date, grid]]);
    const result = traceEnsemble(stationLat, stationLng, date, map);
    const center = result.members[0];
    const originWaypoint = center[center.length - 1];
    // Wind from North → air arrived from North → origin is north of station
    expect(originWaypoint.lat).toBeGreaterThan(stationLat);
  });

  it('trajectory stops when wind data missing for later dates', () => {
    // Only d0 provided; step 4 needs d1 → trace stops at 4 waypoints
    const grid = makeGrid(stationLat, stationLng, 20, 270);
    const map = new Map([[date, grid]]);
    const result = traceEnsemble(stationLat, stationLng, date, map);
    const center = result.members[0];
    // Steps 1,2,3 use d0 (hours 6,12,18 → floor(h/24)=0); step 4 needs d1 → stop
    expect(center.length).toBe(4); // station + 3 steps
  });

  it('footprintBbox contains all waypoints (before padding, with pad subtracted)', () => {
    const grid = makeGrid(stationLat, stationLng, 50, 180);
    const d1 = offsetDate(date, -1);
    const d2 = offsetDate(date, -2);
    const map = new Map([
      [date, grid],
      [d1, makeGrid(stationLat - 2, stationLng, 50, 180)],
      [d2, makeGrid(stationLat - 4, stationLng, 50, 180)],
    ]);
    const result = traceEnsemble(stationLat, stationLng, date, map);
    const pad = result.corridorKm / 111;
    for (const member of result.members) {
      for (const wp of member) {
        expect(wp.lat).toBeGreaterThanOrEqual(result.footprintBbox.latMin + pad - 0.001);
        expect(wp.lat).toBeLessThanOrEqual(result.footprintBbox.latMax - pad + 0.001);
        expect(wp.lng).toBeGreaterThanOrEqual(result.footprintBbox.lngMin + pad - 0.001);
        expect(wp.lng).toBeLessThanOrEqual(result.footprintBbox.lngMax - pad + 0.001);
      }
    }
  });

  it('corridorKm clamps to 75 at very low wind speed', () => {
    const grid = makeGrid(stationLat, stationLng, 1, 0);
    const map = new Map([[date, grid]]);
    const result = traceEnsemble(stationLat, stationLng, date, map);
    expect(result.corridorKm).toBe(75);
  });

  it('corridorKm clamps to 400 at very high wind speed', () => {
    const grid = makeGrid(stationLat, stationLng, 200, 0);
    const map = new Map([[date, grid]]);
    const result = traceEnsemble(stationLat, stationLng, date, map);
    expect(result.corridorKm).toBe(400);
  });

  it('uses default corridorKm 150 when no wind data', () => {
    const map = new Map<string, WindGridPoint[]>();
    const result = traceEnsemble(stationLat, stationLng, date, map);
    expect(result.corridorKm).toBe(150);
    expect(result.meanWindSpeedKmh).toBe(20);
  });

  it('wrap-around: wind from 350° near prime meridian produces no NaN coords', () => {
    const nearMeridianLat = 10;
    const nearMeridianLng = 1; // 1° E — near but not at prime meridian
    const grid = makeGrid(nearMeridianLat, nearMeridianLng, 50, 350);
    const d1 = offsetDate(date, -1);
    const d2 = offsetDate(date, -2);
    const map = new Map([
      [date, grid],
      [d1, grid],
      [d2, grid],
    ]);
    const result = traceEnsemble(nearMeridianLat, nearMeridianLng, date, map);
    for (const member of result.members) {
      for (const wp of member) {
        expect(Number.isFinite(wp.lat)).toBe(true);
        expect(Number.isFinite(wp.lng)).toBe(true);
        expect(Number.isNaN(wp.lat)).toBe(false);
        expect(Number.isNaN(wp.lng)).toBe(false);
      }
    }
  });
});

describe('haversineKm (from lib/geo)', () => {
  it('Bangkok to Chiang Mai ≈ 590 km (within 5%)', () => {
    const dist = haversineKm(13.75, 100.5, 18.79, 98.98);
    expect(dist).toBeGreaterThan(590 * 0.95);
    expect(dist).toBeLessThan(590 * 1.05);
  });
});

describe('bearingDeg (from lib/geo)', () => {
  it('due north returns 0', () => {
    expect(bearingDeg(10, 100, 20, 100)).toBeCloseTo(0, 0);
  });

  it('due east returns 90 (on equator)', () => {
    expect(bearingDeg(0, 100, 0, 110)).toBeCloseTo(90, 0);
  });
});
