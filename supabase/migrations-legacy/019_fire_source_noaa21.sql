-- Switch fire data source from Suomi-NPP to NOAA-21.
-- Existing SNPP rows are dropped; the default source label is updated.
-- Run this migration before the backfill:fires-noaa21 script.

TRUNCATE TABLE fire_points;

ALTER TABLE fire_points
  ALTER COLUMN source SET DEFAULT 'VIIRS_NOAA21_NRT';
