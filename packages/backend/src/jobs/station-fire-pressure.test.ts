import { describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted before imports by Vitest — prevents db/client.ts from
// throwing when SUPABASE_* env vars are absent in the test environment.
vi.mock('../db/client.js', () => ({ supabase: {} }));

import { computeStationFirePressureScores } from './station-fire-pressure.js';

const RADIUS_KM = 75;
const STATION = { id: 'st1', lat: 15.0, lng: 100.0 };

describe('computeStationFirePressureScores', () => {
  it('returns score 0 when there are no fires', () => {
    const results = computeStationFirePressureScores([STATION], [], RADIUS_KM);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
    expect(results[0].fireCount).toBe(0);
    expect(results[0].totalFrpMw).toBe(0);
  });

  it('includes a fire exactly at the station', () => {
    const fires = [{ lat: 15.0, lng: 100.0, frp: 50 }];
    const results = computeStationFirePressureScores([STATION], fires, RADIUS_KM);
    expect(results[0].fireCount).toBe(1);
    expect(results[0].totalFrpMw).toBe(50);
  });

  it('excludes a fire beyond the radius', () => {
    // 15.75°N, 100.0°E is ~83 km north of station (15.0°N, 100.0°E) — beyond 75 km
    const fires = [{ lat: 15.75, lng: 100.0, frp: 100 }];
    const results = computeStationFirePressureScores([STATION], fires, RADIUS_KM);
    expect(results[0].fireCount).toBe(0);
  });

  it('includes a fire just within the radius', () => {
    // 15.6°N, 100.0°E is ~67 km north of station — within 75 km
    const fires = [{ lat: 15.6, lng: 100.0, frp: 100 }];
    const results = computeStationFirePressureScores([STATION], fires, RADIUS_KM);
    expect(results[0].fireCount).toBe(1);
  });

  it('score caps at 100', () => {
    const fires = Array.from({ length: 10_000 }, () => ({ lat: 15.0, lng: 100.0, frp: 500 }));
    const results = computeStationFirePressureScores([STATION], fires, RADIUS_KM);
    expect(results[0].score).toBe(100);
  });

  it('treats null frp as 0', () => {
    const fires = [{ lat: 15.0, lng: 100.0, frp: null }];
    const results = computeStationFirePressureScores([STATION], fires, RADIUS_KM);
    expect(results[0].fireCount).toBe(1);
    expect(results[0].totalFrpMw).toBe(0);
  });

  it('computes score independently per station', () => {
    const near = { id: 'near', lat: 15.0, lng: 100.0 };
    const far = { id: 'far', lat: 20.0, lng: 100.0 };
    const fires = [{ lat: 15.0, lng: 100.0, frp: 100 }];
    const results = computeStationFirePressureScores([near, far], fires, RADIUS_KM);
    const nearResult = results.find((r) => r.stationId === 'near')!;
    const farResult = results.find((r) => r.stationId === 'far')!;
    expect(nearResult.fireCount).toBe(1);
    expect(farResult.fireCount).toBe(0);
  });
});
