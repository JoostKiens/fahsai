export interface WeatherReading {
  lat: number;
  lng: number;
  wind_speed_kmh: number; // daily mean
  wind_speed_max_kmh: number | null; // daily maximum
  wind_direction_deg: number; // meteorological FROM-direction, snapshot at 07:00 UTC (14:00 BKK)
  precipitation_sum: number | null;
  relative_humidity_2m: number | null; // daily mean
}
