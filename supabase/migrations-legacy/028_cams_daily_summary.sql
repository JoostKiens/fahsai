-- Daily nationwide CAMS PM2.5 summary — one row per date.
-- Stores the 90th-percentile PM2.5 across that day's CAMS grid, used to color the
-- time scrubber's heat-strip so seasonal differences are visible at a glance.
-- Computed during cams-ingest (gated on a complete grid) and backfilled from cams_grid.

CREATE TABLE IF NOT EXISTS cams_daily_summary (
  date          DATE              PRIMARY KEY,
  pm25_p90      DOUBLE PRECISION  NOT NULL,
  point_count   INTEGER           NOT NULL,
  created_at    TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- RLS on, no public policies — the backend service role bypasses RLS.
ALTER TABLE public.cams_daily_summary ENABLE ROW LEVEL SECURITY;
