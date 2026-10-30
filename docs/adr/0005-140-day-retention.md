# ADR 0005 — Keep 140 days of data, sized to the free-tier database cap

**Date:** 2026-07-15 (written up retroactively on 2026-10-30)
**Status:** Accepted

## Context

Supabase's free tier caps the database at **500 MB**. Above that the database switches to
read-only, and every ingest job fails on its first `INSERT`. Most tables grow by a fixed amount
per day: the CAMS and weather grids add 4,599 rows each per day, plus station readings, per-station
weather and fire-pressure scores. Fires are seasonal: the February–April burning season produces
many times more detections than the rest of the year.

The product needs history: the time scrubber goes back up to 120 days (`MAX_DAYS`), and
`/api/explain` looks back a further week for trends.

## Decision

A daily `prune` cron deletes rows older than **140 days** from every time-series table:
120 days for the scrubber, plus 7 days for explain's history, plus a margin for time zones and
prune timing. It started at 120 days and was raised to 140 once there was measured headroom.

Measured on 2026-10-30:

|                               | Size                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| Database (Supabase dashboard) | ~413 MB of 500 MB (~83%), after dropping 64 MB of redundant indexes the same day (it was at 95%)    |
| `weather_readings`            | 103 MB, at steady state (4,599 × 140 ≈ 644K rows)                                                   |
| `fire_points`                 | 89 MB for 33K off-season rows: Postgres keeps the pages from the last burning-season peak for reuse |
| `cams_grid`                   | 80 MB, at steady state                                                                              |

The grids no longer grow, because prune removes a day for every day added. The main growth risk is
a burning season bigger than the one whose pages `fire_points` still holds.

## Alternatives considered

- **Supabase Pro ($25/month).** Removes the cap but multiplies the project's running cost by about
  six, for a personal non-commercial project.
- **Pack each grid day into one row** (one array per date instead of 4,599 rows). This would cut
  per-row overhead and index size substantially. It's being evaluated in JOO-81 but not
  implemented, because it changes every grid query and ingest.
- **Shorter retention.** It would cut the scrubber's 120-day window, which the product wants for
  comparing a burning season with the weeks before it.

## Consequences

- The scrubber's maximum window is effectively capped by storage, not by product choice.
- Storage has to be watched before each burning season. The `pipeline-health` cron (JOO-78) catches
  the read-only failure within a day, and `docs/claude/costs.md` records the headroom.
- Raising retention or adding a per-day table needs a size estimate first.
  `docs/claude/database.md` has the per-table numbers.
- JOO-81 still owns backups, a tested restore, and the grid-packing evaluation. A storage ADR from
  that work may supersede this one.
