-- provider, is_mobile, is_monitor, parameters: stored but never read by any query or consumed by frontend.
-- created_at, updated_at, datetime_last: written but never selected.
ALTER TABLE public.stations
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS is_mobile,
  DROP COLUMN IF EXISTS is_monitor,
  DROP COLUMN IF EXISTS parameters,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS datetime_last;
