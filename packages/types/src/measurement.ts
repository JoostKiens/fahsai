export interface Measurement {
  stationId: string;
  value: number;
  measuredAt: string; // ISO 8601
}

export interface AQICategory {
  label: string;
  color: string;
  min: number;
  max: number;
}
