-- Hourly city PM2.5 (JOO-140). Both tables are append-only (upsert on the key) and pruned after
-- 30 days by the prune job.

-- The latest hourly PM2.5 of each station in a city footprint, from OpenAQ /locations/{id}/latest,
-- freshest PM2.5 sensor of the location. measured_at is OpenAQ's stamp: the end of the measured
-- hour (12:00 covers 11:00–12:00). Kept apart from station_readings, which holds daily means.
CREATE TABLE "public"."station_readings_hourly" (
    "station_id" "text" NOT NULL REFERENCES "public"."stations"("id"),
    "measured_at" timestamp with time zone NOT NULL,
    "pm25" real NOT NULL,
    "sensor_id" integer NOT NULL,
    PRIMARY KEY ("station_id", "measured_at")
);

CREATE INDEX "station_readings_hourly_measured_at_idx"
    ON "public"."station_readings_hourly" ("measured_at");

-- The blended PM2.5 per city and hour: a weighted mean of the city's station value and CAMS.
-- valid_at is the end of the hour, as in station_readings_hourly. The inputs are kept so a value
-- can be explained and the weights tuned later. pm25 is NOT NULL: with neither input there is no row.
CREATE TABLE "public"."city_pm25_hourly" (
    "city_slug" "text" NOT NULL,
    "valid_at" timestamp with time zone NOT NULL,
    "pm25" real NOT NULL,
    "station_pm25" real,
    -- the median of the city's stations, for the safety rule: the shown band is never better than it
    "station_median" real,
    "station_count" smallint NOT NULL CHECK ("station_count" >= 0),
    "station_weight" real NOT NULL CHECK ("station_weight" >= 0 AND "station_weight" <= 1),
    "cams_pm25" real,
    "cams_run_at" timestamp with time zone,
    PRIMARY KEY ("city_slug", "valid_at")
);

-- RLS on, no public policies: only the backend's service role reads and writes them.
ALTER TABLE "public"."station_readings_hourly" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."city_pm25_hourly" ENABLE ROW LEVEL SECURITY;

-- Only Supabase has the role; CI's schema-drift job runs on plain Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."station_readings_hourly" TO "service_role";
    GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."city_pm25_hourly" TO "service_role";
  END IF;
END
$$;

-- Rollback: DROP TABLE "public"."city_pm25_hourly"; DROP TABLE "public"."station_readings_hourly";
