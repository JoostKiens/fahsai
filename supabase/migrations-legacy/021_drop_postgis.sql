-- PostGIS was only used for the location geography column on fire_points,
-- which was dropped in migration 020. No other tables use geometry or geography types.
DROP EXTENSION IF EXISTS postgis CASCADE;
