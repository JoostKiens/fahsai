-- Replace fire_pressure_scores (grid-cell based) with station_fire_pressure (75 km radius per station).
-- This enables direct attribution of fire influence to monitoring stations.

-- 1. Create the new station_fire_pressure table.
CREATE TABLE IF NOT EXISTS station_fire_pressure (
  station_id        TEXT              NOT NULL REFERENCES stations(id),
  date              DATE              NOT NULL,
  score             NUMERIC(6,2)      NOT NULL DEFAULT 0,
  fire_count        INTEGER           NOT NULL DEFAULT 0,
  total_frp_mw      NUMERIC(10,2)     NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, date)
);

-- 2. Create index on date for fast time-range queries.
CREATE INDEX IF NOT EXISTS station_fire_pressure_date_idx ON station_fire_pressure (date);

-- 3. Drop the old grid-cell based table.
DROP TABLE IF EXISTS fire_pressure_scores;
