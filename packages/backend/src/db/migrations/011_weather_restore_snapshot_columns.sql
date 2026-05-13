-- Restore wind snapshot and humidity columns removed in migration 010.
-- wind_speed_kmh and relative_humidity_2m are now hourly snapshots at 07:00 UTC (14:00 BKK).
alter table weather_readings
  add column if not exists wind_speed_kmh float8,
  add column if not exists relative_humidity_2m float8;
