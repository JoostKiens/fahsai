-- Weather grid (Open-Meteo forecast/archive, snapshot at 07:00 UTC = 14:00 BKK)
-- Pruned after 40 days. Redis (weather:{date}, TTL 25h) is the hot cache; Supabase
-- is the persistent store. Only wind fields are currently used by the UI and Explain
-- feature; precipitation, humidity, and temperature are stored for future use.
create table if not exists weather_readings (
  date                      date   not null,
  lat                       float8 not null,
  lng                       float8 not null,
  wind_speed_kmh            float8 not null,  -- daily mean
  wind_speed_max_kmh        float8,           -- daily maximum
  wind_direction_deg        float8 not null,  -- meteorological FROM-direction, snapshot at 07:00 UTC (14:00 BKK)
  precipitation_sum         float8,          -- daily total mm
  relative_humidity_2m      float8,          -- % at 07:00 UTC snapshot
  temperature_2m_mean       float8,          -- daily mean °C
  temperature_2m_min        float8,          -- daily min °C
  temperature_2m_max        float8,          -- daily max °C
  primary key (date, lat, lng)
);
create index if not exists weather_readings_date_idx on weather_readings (date);
alter table public.weather_readings enable row level security;
