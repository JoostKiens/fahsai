-- Drop unused columns and the redundant PostGIS geography column from fire_points.
-- location is duplicate of lat/lng (all bbox queries use plain lat/lng range filters).
-- brightness, bright_ti4, bright_ti5 are raw sensor values never consumed by the frontend.
-- country_id is always NULL.
-- created_at is the row insertion timestamp, not used in any query or UI.

DROP INDEX IF EXISTS fire_points_location_idx;
DROP INDEX IF EXISTS fire_points_country_id_idx;

ALTER TABLE fire_points
  DROP COLUMN IF EXISTS location,
  DROP COLUMN IF EXISTS brightness,
  DROP COLUMN IF EXISTS bright_ti4,
  DROP COLUMN IF EXISTS bright_ti5,
  DROP COLUMN IF EXISTS country_id,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS satellite;
