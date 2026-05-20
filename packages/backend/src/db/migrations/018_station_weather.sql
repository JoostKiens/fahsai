-- Pre-computed weather per station per day, populated by weather-ingest.
-- Eliminates the weather_readings grid lookup in the history endpoint:
-- the snap from station coordinates to the nearest 0.4° grid cell is done once
-- at ingest time for all active stations, not at every query.
CREATE TABLE IF NOT EXISTS (
  date                  date NOT NULL,
  station_id            text NOT NULL REFERENCES stations(id),
  wind_speed_kmh        float8,
  wind_direction_deg    float8,
  precipitation_sum     float8,
  relative_humidity_2m  float8,
  PRIMARY KEY (station_id, date)
);

ALTER TABLE public.station_weather ENABLE ROW LEVEL SECURITY;
