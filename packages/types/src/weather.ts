export interface WeatherReading {
  lat: number;
  lng: number;
  wind_speed_kmh: number; // hourly snapshot at 14:00 BKK (Asia/Bangkok)
  wind_direction_deg: number; // hourly snapshot at 14:00 BKK; meteorological FROM-direction
  relative_humidity_2m: number | null; // hourly snapshot at 14:00 BKK
  precipitation_sum: number | null; // daily total (Bangkok calendar day)
}

export type WindReading = Pick<
  WeatherReading,
  'lat' | 'lng' | 'wind_speed_kmh' | 'wind_direction_deg'
>;
