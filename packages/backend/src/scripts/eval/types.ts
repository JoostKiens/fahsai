import type { ExplainCase } from '../../routes/explain'; // or wherever you define the union

// ----------------------------------------------------------------
// Sub-types
// ----------------------------------------------------------------

export interface FixtureStation {
  name: string;
  lat: number;
  lng: number;
}

export interface FixtureDailyReading {
  date: string; // YYYY-MM-DD
  value: number; // µg/m³
}

export type WindDataState = 'available' | 'missing' | 'not_fetched';

export interface FixtureWind {
  state: WindDataState;
  directionDeg: number | null; // null when state !== 'available'
  speedKmh: number | null;
}

export interface FixtureWeatherReading {
  date: string;
  wind: FixtureWind;
  precipitationMm: number;
  humidity: number | null; // RH %; null when data unavailable
  highHumidityWarning: boolean;
}

export interface FixtureWeather {
  days: FixtureWeatherReading[];
  totalPrecipitationMm: number; // 5-day rolling total
  trajectoryOriginPrecipitationMm: number | null; // rain at trajectory origin date
}

export interface FixtureTrajectoryWaypoint {
  lat: number;
  lng: number;
  region: string; // 'Thailand' | 'Myanmar' | 'Laos' | 'Andaman sea' | 'Gulf of Thailand' etc.
}

export interface FixtureTrajectoryOrigin {
  lat: number;
  lng: number;
  region: string;
  date: string; // YYYY-MM-DD
}

export interface FixtureCamsReading {
  lat: number;
  lng: number;
  date: string;
  pm25: number;
}

export interface FixtureTrajectory {
  hoursTraced: number; // e.g. 66
  memberCount: number; // ensemble size, e.g. 5
  origin: FixtureTrajectoryOrigin;
  corridorWidthKm: number;
  meanWindSpeedKmh: number;
  waypoints: FixtureTrajectoryWaypoint[];
  camsAlongPath: FixtureCamsReading[];
}

export interface FixtureFirePressure {
  pathScore: number | null; // null when reading is a strong outlier
  pathFireCount: number | null; // null when reading is a strong outlier
  pathFiresByRecency: {
    last24h: { count: number; totalFrpMw: number };
    last48h: { count: number; totalFrpMw: number };
    last72h: { count: number; totalFrpMw: number };
  } | null; // null when reading is a strong outlier
  areaScore: number; // 0–100, 14-day precomputed grid score
  areaFireCount: number | null; // null when outside grid
  areaTotalFrpMw: number | null;
}

export interface FixtureUpwindSource {
  name: string;
  country: string; // ISO 3166-1 alpha-2, e.g. 'TH'
  distanceKm: number;
  type: 'city' | 'coal_plant' | 'gas_plant' | 'oil_plant' | 'industrial';
  population?: number; // for cities
  capacityMw?: number; // for power plants
  currentlyUpwind: boolean;
}

export interface FixturePeerStation {
  name: string;
  value: number; // µg/m³
  distanceKm: number;
}

export interface FixturePeerContext {
  stationCount: number;
  weightedMean: number;
  unweightedMedian: number;
  range: { min: number; max: number };
  stations: FixturePeerStation[];
}

export interface FixtureOutlier {
  direction: 'high' | 'low';
  ratio: number; // e.g. 0.4 = reading is 0.4× peer mean
}

// ----------------------------------------------------------------
// Season type — drives SEASONAL CONTEXT selection
// ----------------------------------------------------------------

export type Season =
  | 'peak_burning' // Feb–Apr
  | 'early_dry' // Oct–Jan
  | 'monsoon'; // May–Sep

// ----------------------------------------------------------------
// Root fixture type
// ----------------------------------------------------------------

export interface ExplainFixtureInput {
  station: FixtureStation;
  date: string; // YYYY-MM-DD, station local date (UTC+7)
  currentPm25: number;

  sevenDayAverages: FixtureDailyReading[];

  weather: FixtureWeather;

  // null for OUTLIER_HIGH / OUTLIER_LOW — classifier excludes these
  trajectory: FixtureTrajectory | null;
  firePressure: FixtureFirePressure | null;
  upwindSources: FixtureUpwindSource[] | null;

  peers: FixturePeerContext | null; // null when fewer than 2 stations within 75 km

  outlier: FixtureOutlier | null; // null when reading is within normal peer range

  season: Season;

  persistentWind: {
    directionDeg: number;
    label: string; // compass label e.g. "SSE"
    dayCount: number;
    sourcesBeyondWindow: FixtureUpwindSource[]; // sources in that direction beyond corridorKm
  } | null;
}

export interface ExplainFixture {
  id: string; // e.g. '01-outlier-low-erawan'
  case: ExplainCase;
  description: string; // why this fixture exists, human-readable
  input: ExplainFixtureInput;
}
