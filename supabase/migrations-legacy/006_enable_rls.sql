-- Run manually in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Safe to re-run — ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent.
--
-- The backend uses the service role key, which bypasses RLS automatically.
-- No application-level policies are needed — enabling RLS is enough to satisfy
-- the security advisor and block any direct anon/public access.

-- Application tables — RLS on, no public policies (service role bypasses RLS)
alter table public.fire_points   enable row level security;
alter table public.stations      enable row level security;
alter table public.measurements  enable row level security;
alter table public.power_plants  enable row level security;
alter table public.aq_grid       enable row level security;

-- Note: public.spatial_ref_sys is a PostGIS extension table owned by the postgres
-- superuser. Supabase does not grant project users ownership of extension tables,
-- so RLS cannot be enabled on it. The security advisor warning for that table is a
-- known false positive — ignore it.
