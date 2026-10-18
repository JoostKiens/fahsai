alter table weather_readings
  drop column if exists wind_speed_kmh,
  drop column if exists relative_humidity_2m;
