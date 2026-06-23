export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
}

import type { BaselineStat } from './baseline';

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
  baseline: BaselineStat | null;
}
