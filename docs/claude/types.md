# Shared TypeScript types (`packages/types`)

Types live in `packages/types/src/` and are imported by both frontend and backend.
`AQIReading` (earlier design) is gone -- the current model is `Station` + `Measurement`.
Key files: `measurement.ts`, `station.ts`, `baseline.ts`, `fire.ts`, `wind.ts`, `aq.ts`.

```typescript
// fire.ts
export interface FirePoint {
  id:          number;
  detectedAt:  string;          // ISO 8601
  lat:         number;
  lng:         number;
  frp:         number | null;   // fire radiative power MW
  brightTi4:   number | null;   // brightness temperature band I-4
  brightTi5:   number | null;   // brightness temperature band I-5
  countryId:   string;          // ISO 3166-1 alpha-3
  satellite:   string | null;   // 'N' = Suomi-NPP, '1' = NOAA-20
  confidence:  string | null;   // 'low' | 'nominal' | 'high'
  daynight:    string | null;   // 'D' | 'N'
}

// station.ts
export interface Station {
  id:         string;
  name:       string;
  lat:        number;
  lng:        number;
  country:    string;
  provider:   string | null;
  isMobile:   boolean;
  isMonitor:  boolean | null;
  parameters: string[];
}

// measurement.ts
export interface Measurement {
  stationId:  string;
  sensorId:   number;
  parameter:  string;   // 'pm25' | 'pm10' | 'no2' | 'o3' | 'so2' | 'co' | 'bc'
  value:      number;
  unit:       string;   // 'µg/m³', 'ppm', etc.
  measuredAt: string;   // ISO 8601
}

export interface AQICategory {
  label: string;
  color: string;
  min:   number;
  max:   number;
}

// baseline.ts
export interface BaselineStat {
  medianPm25: number;
  p25Pm25:    number;
  p75Pm25:    number;
  n:          number;
}

export interface BaselineDay extends BaselineStat {
  month: number;
  day:   number;
}

// station.ts (StationDayHistory -- returned by /api/stations/:id/history)
export interface StationDayHistory {
  date:         string;
  meanPm25:     number;
  readingCount: number;
  weather: {
    windSpeedKmh:        number | null;
    windDirectionDeg:    number | null;
    precipitationSumMm:  number | null;
    relativeHumidity2m:  number | null;
  } | null;
  baseline: BaselineStat | null;
}

// wind.ts
export interface WindVector {
  lat:          number;
  lng:          number;
  speedKmh:     number;
  directionDeg: number; // meteorological: 0=N, 90=E, 180=S, 270=W (FROM direction)
}

// aq.ts
export interface PM25GridPoint {
  lat:  number;
  lng:  number;
  pm25: number; // daily mean µg/m³ from CAMS model via Open-Meteo
}
```
