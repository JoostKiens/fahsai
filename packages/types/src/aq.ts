export interface PM25GridPoint {
  lat: number;
  lng: number;
  pm25: number; // daily mean µg/m³ from CAMS model via Open-Meteo
}

// Wire format for GET /api/cams — parallel arrays instead of PM25GridPoint[]
// to cut per-point key-name overhead over the network.
export interface PM25GridColumns {
  lats: number[];
  lngs: number[];
  pm25s: number[];
}

export interface PM25DailySummary {
  date: string; // YYYY-MM-DD
  pm25: number; // 95th-percentile µg/m³ across that day's CAMS grid
}
