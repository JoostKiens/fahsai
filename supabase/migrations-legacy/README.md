# Legacy migrations (archived)

Migrations `001`-`034`, applied to the live database up to 2026-10-18. Kept for history only.

**Do not edit, apply, or add files here.** They are not a replayable record of the schema:
early ones were run by hand in the Supabase SQL editor, some changes were made with no
migration (e.g. `stations.location` and `power_plants.location` were dropped manually), and
`001`/`003`/`004` need PostGIS, which `021` later drops.

The source of truth is `supabase/migrations/20261018000000_baseline.sql` (a dump of the live
`public` schema) plus any migrations added after it.
