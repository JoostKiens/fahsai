-- CAMS PM2.5 per city and hour from the latest forecast run (JOO-138): the mean of the cells the
-- city's footprint overlaps, weighted by overlap area. Each run replaces the previous one, so the
-- table only ever holds one run per city (about 121 rows per city).
CREATE TABLE "public"."city_cams_hourly" (
    "city_slug" "text" NOT NULL,
    "valid_at" timestamp with time zone NOT NULL,
    "pm25" real NOT NULL,
    "run_at" timestamp with time zone NOT NULL,
    "lead_hour" smallint NOT NULL CHECK ("lead_hour" >= 0),
    PRIMARY KEY ("city_slug", "valid_at")
);

-- RLS on, no public policies: only the backend's service role reads and writes it.
ALTER TABLE "public"."city_cams_hourly" ENABLE ROW LEVEL SECURITY;

-- Only Supabase has the role; CI's schema-drift job runs on plain Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "public"."city_cams_hourly" TO "service_role";
  END IF;
END
$$;

-- Rollback: DROP TABLE "public"."city_cams_hourly";
