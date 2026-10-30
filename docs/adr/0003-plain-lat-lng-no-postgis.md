# ADR 0003 — Store coordinates as plain lat/lng, not PostGIS

**Date:** 2026-05-25 (written up retroactively on 2026-10-30)
**Status:** Accepted

## Context

The first schema stored each fire detection twice: as `lat`/`lng` floats and as a PostGIS
`geography` column (`location`) with a GiST index. Once the API was built, every spatial query
turned out to be one of two simple shapes:

- **Bounding-box filters** for the map (`lat between … and lng between …`), which a B-tree on plain
  floats answers well.
- **Distance work in application code**: the 75 km fire-pressure radius, the backward-trajectory
  footprint for `/api/explain` and nearest-grid-point lookups. These need loops over small sets
  of points in TypeScript (haversine, bearings), not database-side spatial joins.

Nothing queried `location`. It and its index still cost storage on the Supabase free tier, whose
0.5 GB cap is the project's tightest constraint (see [ADR 0005](0005-140-day-retention.md)).

## Decision

Drop the `geography` column and its index (legacy migration 020), then drop the PostGIS extension
(021). Every table stores coordinates as `float8 lat, lng`. Spatial logic lives in
`packages/backend/src/utils/geo.ts` and `utils/trajectory.ts`.

## Alternatives considered

- **Keep PostGIS and move the distance logic into SQL** (`ST_DWithin`, spatial joins). This would
  be more correct at the poles and antimeridian, which don't matter for Southeast Asia, but it
  costs index storage and moves logic out of the unit-tested TypeScript into SQL.
- **Keep the column "for later".** Rejected: storage is the binding constraint, and nothing needed
  it.

## Consequences

- Smaller tables and indexes, and one fewer extension to manage. Supabase's security advisor also
  stops flagging `spatial_ref_sys`.
- Bounding-box queries stay simple and fast on B-tree indexes.
- Anything that needs a true spatial index later, such as a "fires within N km of every station"
  join at a much larger scale, would need PostGIS back, or a set-based SQL approach. JOO-80
  benchmarks the fire-pressure calculation in JS, set-based SQL and PostGIS for exactly that case.
