import { Type } from '@fastify/type-provider-typebox';

// Hourly snapshots are at 14:00 Bangkok time; the daily total is for the Bangkok calendar day.
// wind_speed_kmh is a plain number here although the column is nullable: the ingest never writes
// null (see JOO-92), and the frontend relies on it.
export const WeatherReadingSchema = Type.Object({
  lat: Type.Number(),
  lng: Type.Number(),
  wind_speed_kmh: Type.Number({ description: 'Wind speed at 10 m, km/h.' }),
  wind_direction_deg: Type.Number({ description: 'Meteorological FROM-direction, degrees.' }),
  relative_humidity_2m: Type.Union([Type.Number(), Type.Null()], { description: 'Percent.' }),
  precipitation_sum: Type.Union([Type.Number(), Type.Null()], { description: 'Daily total, mm.' }),
});

export const WindReadingSchema = Type.Pick(WeatherReadingSchema, [
  'lat',
  'lng',
  'wind_speed_kmh',
  'wind_direction_deg',
]);
