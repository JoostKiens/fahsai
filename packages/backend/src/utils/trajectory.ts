import { haversineKm, bearingDeg } from '../utils/geo.js';

export interface WindGridPoint {
  lat: number;
  lng: number;
  wind_speed_kmh: number;
  wind_direction_deg: number; // meteorological FROM direction
}

export interface TrajectoryWaypoint {
  lat: number;
  lng: number;
  date: string; // YYYY-MM-DD — which day's wind grid was used
  stepIndex: number; // 0 = station position, N = furthest back
}

export interface EnsembleResult {
  /** All waypoint paths, one per ensemble member. Index 0 is the center member. */
  members: TrajectoryWaypoint[][];
  /** Bounding box covering all waypoints + corridorKm padding */
  footprintBbox: { latMin: number; latMax: number; lngMin: number; lngMax: number };
  /** Dynamic corridor width in km, derived from mean wind speed */
  corridorKm: number;
  /** Mean wind speed across all grid points on d0, km/h */
  meanWindSpeedKmh: number;
}

const STEP_HOURS = 6;
const STEPS = 12; // 6h × 12 = 72h look-back
export const TRAJECTORY_STEPS = STEPS;
const KMH_TO_DEG_LAT = 1 / 111;
const ENSEMBLE_OFFSET_DEG = 0.4; // ~44 km, one grid cell

/** Returns date offset by `days` days from `dateStr` (YYYY-MM-DD) */
export function offsetDate(dateStr: string, days: number): string {
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(yr, mo - 1, dy + days)).toISOString().slice(0, 10);
}

/** Returns nearest WindGridPoint to (lat, lng) in a grid array */
export function nearestGridPoint(lat: number, lng: number, grid: WindGridPoint[]): WindGridPoint {
  let best = grid[0];
  let bestD = (best.lat - lat) ** 2 + (best.lng - lng) ** 2;
  for (const p of grid.slice(1)) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

function traceBackTrajectory(
  startLat: number,
  startLng: number,
  selectedDate: string,
  windGridsByDate: Map<string, WindGridPoint[]>,
): TrajectoryWaypoint[] {
  const waypoints: TrajectoryWaypoint[] = [
    { lat: startLat, lng: startLng, date: selectedDate, stepIndex: 0 },
  ];

  let y = startLat;
  let x = startLng;

  for (let i = 1; i <= STEPS; i++) {
    const hoursBack = i * STEP_HOURS;
    const stepDate = offsetDate(selectedDate, -Math.floor(hoursBack / 24));
    const grid = windGridsByDate.get(stepDate);
    if (!grid?.length) break;

    const pt = nearestGridPoint(y, x, grid);
    const windDir = pt.wind_direction_deg;
    const windSpeed = pt.wind_speed_kmh;

    // +180 converts FROM direction to TO direction; subtracting displacement traces backward
    const travelRad = ((windDir + 180) % 360) * (Math.PI / 180);
    const cosLat = Math.max(Math.cos((y * Math.PI) / 180), 0.1);
    const kmhToDegLng = 1 / (111 * cosLat);

    x -= Math.sin(travelRad) * windSpeed * STEP_HOURS * kmhToDegLng;
    y -= Math.cos(travelRad) * windSpeed * STEP_HOURS * KMH_TO_DEG_LAT;

    waypoints.push({ lat: y, lng: x, date: stepDate, stepIndex: i });
  }

  return waypoints;
}

export function traceEnsemble(
  stationLat: number,
  stationLng: number,
  selectedDate: string,
  windGridsByDate: Map<string, WindGridPoint[]>,
): EnsembleResult {
  const offsets = [
    { dlat: 0, dlng: 0 },
    { dlat: ENSEMBLE_OFFSET_DEG, dlng: 0 },
    { dlat: -ENSEMBLE_OFFSET_DEG, dlng: 0 },
    { dlat: 0, dlng: ENSEMBLE_OFFSET_DEG },
    { dlat: 0, dlng: -ENSEMBLE_OFFSET_DEG },
  ];

  const members = offsets.map(({ dlat, dlng }) =>
    traceBackTrajectory(stationLat + dlat, stationLng + dlng, selectedDate, windGridsByDate),
  );

  const wind0 = windGridsByDate.get(selectedDate) ?? [];
  const meanWindSpeedKmh =
    wind0.length > 0 ? wind0.reduce((sum, p) => sum + p.wind_speed_kmh, 0) / wind0.length : 20;

  const corridorKm =
    wind0.length > 0 ? Math.min(400, Math.max(75, meanWindSpeedKmh * 24 * 0.5)) : 150;

  const pad = corridorKm / 111;
  let latMin = Infinity;
  let latMax = -Infinity;
  let lngMin = Infinity;
  let lngMax = -Infinity;

  for (const member of members) {
    for (const wp of member) {
      if (wp.lat < latMin) latMin = wp.lat;
      if (wp.lat > latMax) latMax = wp.lat;
      if (wp.lng < lngMin) lngMin = wp.lng;
      if (wp.lng > lngMax) lngMax = wp.lng;
    }
  }

  return {
    members,
    footprintBbox: {
      latMin: latMin - pad,
      latMax: latMax + pad,
      lngMin: lngMin - pad,
      lngMax: lngMax + pad,
    },
    corridorKm,
    meanWindSpeedKmh,
  };
}

// Re-export for consumers that want these alongside trajectory types
export { haversineKm, bearingDeg };
