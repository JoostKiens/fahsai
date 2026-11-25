-- The forecast each city page shows (JOO-140): per Bangkok day, the mean of the hourly CAMS
-- forecast scaled by the anchor factor, factor = clamp(blend / CAMS, 0.5, 2) for the latest hour.
-- One set per issue hour: append-only (upsert on the key), pruned after 30 days. Daily, not hourly,
-- rows: the page shows daily bands, and this is the record a backtest of what was shown needs
-- (hourly rows would be ~260k at 30 days).
CREATE TABLE "public"."city_forecast_daily" (
    "city_slug" "text" NOT NULL,
    -- the blend hour the forecast is anchored to (city_pm25_hourly.valid_at)
    "issued_at" timestamp with time zone NOT NULL,
    -- the Bangkok calendar day
    "day" "date" NOT NULL,
    "pm25" real NOT NULL,
    -- forecast hours in the mean: fewer for today, which only counts the hours still to come
    "hours" smallint NOT NULL CHECK ("hours" > 0),
    "factor" real NOT NULL CHECK ("factor" > 0),
    "cams_run_at" timestamp with time zone NOT NULL,
    PRIMARY KEY ("city_slug", "issued_at", "day")
);

CREATE INDEX "city_forecast_daily_issued_at_idx" ON "public"."city_forecast_daily" ("issued_at");

-- RLS on, no public policies: only the backend's service role reads and writes it.
ALTER TABLE "public"."city_forecast_daily" ENABLE ROW LEVEL SECURITY;

-- Only Supabase has the role; CI's schema-drift job runs on plain Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."city_forecast_daily" TO "service_role";
  END IF;
END
$$;

-- Rollback: DROP TABLE "public"."city_forecast_daily";
