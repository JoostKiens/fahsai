alter table weather_readings
  add column if not exists wind_speed_max_kmh float8;
