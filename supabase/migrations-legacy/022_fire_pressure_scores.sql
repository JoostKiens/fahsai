CREATE TABLE IF NOT EXISTS fire_pressure_scores (
  id          BIGSERIAL    PRIMARY KEY,
  date        DATE         NOT NULL,
  lat         NUMERIC(6,3) NOT NULL,
  lng         NUMERIC(7,3) NOT NULL,
  fire_count  INTEGER      NOT NULL DEFAULT 0,
  total_frp   NUMERIC      NOT NULL DEFAULT 0,
  score       NUMERIC(6,2) NOT NULL DEFAULT 0,
  CONSTRAINT fire_pressure_scores_date_lat_lng_key UNIQUE (date, lat, lng)
);

CREATE INDEX IF NOT EXISTS fire_pressure_scores_date_idx ON fire_pressure_scores (date);
CREATE INDEX IF NOT EXISTS fire_pressure_scores_lat_lng_idx ON fire_pressure_scores (lat, lng);
