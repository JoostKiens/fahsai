ALTER TABLE public.cams_daily_summary
  RENAME COLUMN pm25_p90 TO pm25_p95;

-- Truncate stale p90 values so the backfill re-populates with p95.
TRUNCATE public.cams_daily_summary;
