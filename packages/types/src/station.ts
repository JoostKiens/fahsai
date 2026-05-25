export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
}

export interface StationDayHistory {
  date: string;
  maxPm25: number;
  readingCount: number;
  weather: {
    windSpeedKmh: number | null;
    windDirectionDeg: number | null;
    precipitationSumMm: number | null;
    relativeHumidity2m: number | null;
  } | null;
}
