# Shared TypeScript types (`packages/types`)

Types live in `packages/types/src/` and are imported by both frontend and backend.
`AQIReading` (earlier design) is gone -- the current model is built around `Station`.
Key files: `station.ts`, `baseline.ts`, `fire.ts`, `weather.ts`, `aq.ts`, `power-plant.ts`.
All re-exported from `index.ts`.

```typescript
// fire.ts
export interface FirePoint {
  id: number;
  detectedAt: string; // ISO 8601
  lat: number;
  lng: number;
  frp: number | null; // fire radiative power MW
  confidence: string | null; // 'low' | 'nominal' | 'high'
  daynight: string | null; // 'D' | 'N'
}

// station.ts
export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  provider: string | null;
}

// station.ts (StationDayHistory -- returned by /api/stations/:id/history)
export interface StationDayHistory {
  date: string;
  pm25: number; // the day's *latest* reading, not a mean, despite earlier field name meanPm25
  readingCount: number;
  weather: {
    windSpeedKmh: number | null;
    windDirectionDeg: number | null;
    precipitationSumMm: number | null;
    relativeHumidity2m: number | null;
  } | null;
  baseline: BaselineStat | null;
}

// weather.ts -- snake_case fields (mirror the DB columns directly, no camelCase mapping)
export interface WeatherReading {
  lat: number;
  lng: number;
  wind_speed_kmh: number; // hourly snapshot at 14:00 BKK (Asia/Bangkok)
  wind_direction_deg: number; // hourly snapshot at 14:00 BKK; meteorological FROM-direction
  relative_humidity_2m: number | null; // hourly snapshot at 14:00 BKK
  precipitation_sum: number | null; // daily total (Bangkok calendar day)
}

// WindReading is a Pick of the wind-relevant WeatherReading fields -- there is no
// separate WindVector type or camelCase speedKmh/directionDeg shape.
export type WindReading = Pick<
  WeatherReading,
  'lat' | 'lng' | 'wind_speed_kmh' | 'wind_direction_deg'
>;

// baseline.ts
export interface BaselineStat {
  medianPm25: number;
  p25Pm25: number;
  p75Pm25: number;
  n: number;
}

export interface BaselineDay extends BaselineStat {
  month: number;
  day: number;
}

// Returned by GET /api/stations/:id/baseline
export interface BaselineResponse {
  data: BaselineDay[];
  minYear: number | null;
  maxYear: number | null;
}

export const BASELINE_DISPLAY_GATE = 30; // minimum n before the baseline callout is shown

// BaselineRow is the raw snake_case DB row shape; mapBaselineRow converts it to BaselineStat.
export interface BaselineRow {
  median_pm25: number;
  p25_pm25: number;
  p75_pm25: number;
  n: number;
}
export function mapBaselineRow(row: BaselineRow): BaselineStat;

// classifyReading buckets a current reading against its baseline IQR (used by the
// InfoPanel callout text); dateToPeriodKey buckets a day-of-month into early/mid/late thirds.
export type BaselineCategory = 'wellAbove' | 'above' | 'normal' | 'below' | 'wellBelow';
export function classifyReading(value: number, bl: BaselineStat): BaselineCategory;

export type PeriodKey = 'periodEarly' | 'periodMid' | 'periodLate';
export function dateToPeriodKey(dayOfMonth: number): PeriodKey;

// aq.ts
export interface PM25GridPoint {
  lat: number;
  lng: number;
  pm25: number; // daily mean µg/m³ from CAMS model via Open-Meteo
}

// Wire format for GET /api/cams -- parallel arrays instead of PM25GridPoint[]
// to cut per-point key-name overhead over the network.
export interface PM25GridColumns {
  lats: number[];
  lngs: number[];
  pm25s: number[];
}

// Row shape for GET /api/cams/summary -- one entry per date.
export interface PM25DailySummary {
  date: string; // YYYY-MM-DD
  pm25: number; // 95th-percentile µg/m³ across that day's CAMS grid
}

// power-plant.ts -- GeoJSON FeatureCollection returned by GET /api/power-plants
export interface PowerPlantProperties {
  id: number;
  name: string;
  country: string;
  fuel_type: 'Coal' | 'Gas' | 'Oil' | 'Diesel';
  capacity_mw: number | null;
  owner: string | null;
  commissioned_year: number | null;
}

export interface PowerPlantFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lng, lat]
  properties: PowerPlantProperties;
}

export interface PowerPlantCollection {
  type: 'FeatureCollection';
  features: PowerPlantFeature[];
}
```

There is no `AQICategory` type and no `wind.ts` file -- both were removed/renamed at some
point and this doc kept describing them after the fact.
