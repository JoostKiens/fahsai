export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
}

import type { ClimatologyStat } from './climatology';

export interface StationDayHistory {
  date: string;
  meanPm25: number;
  readingCount: number;
  weather: {
    windSpeedKmh: number | null;
    windDirectionDeg: number | null;
    precipitationSumMm: number | null;
    relativeHumidity2m: number | null;
  } | null;
  climatology: ClimatologyStat | null;
}
