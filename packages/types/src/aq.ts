export interface PM25GridPoint {
  lat: number;
  lng: number;
  pm25: number; // daily mean µg/m³ from CAMS model via Open-Meteo
}

export interface PM25DailySummary {
  date: string; // YYYY-MM-DD
  pm25: number; // 90th-percentile µg/m³ across that day's CAMS grid
}
