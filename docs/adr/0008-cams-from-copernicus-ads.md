# ADR 0008 — Read the CAMS PM2.5 grid from the Copernicus ADS, not Open-Meteo

**Date:** 2026-11-07
**Status:** Accepted
**Switch date:** 2026-11-07, the first Bangkok date stored from the ADS (stored by the 23:00 UTC job
on 7 Nov, about 06:00 Bangkok on 8 Nov). Days before it come from Open-Meteo.

## Context

The PM2.5 grid is the CAMS global forecast model. Until now we got it through Open-Meteo, one
location per call: 4,599 calls a day. The wind and weather grid costs another 4,599. Together that is
9,198 of the free tier's 10,000 daily calls, and the hourly cap (5,000) leaves 401 calls of
headroom in the hour of each run. The calls count per location and per IP.

The CAMS job also failed on connection errors to `air-quality-api.open-meteo.com` on 6 and 7 Nov.
Both CAMS crons crashed, the 6 Nov grid was never stored, and `pipeline-health` reported it.

The Copernicus Atmosphere Data Store (ADS) publishes the same CAMS global forecast. One request
returns the whole bounding box, and it costs no Open-Meteo calls.

### What Open-Meteo does with that data

We measured this on 7 Nov, against the ADS files and the grids we had stored. It is why the
numbers differ at all, so it is worth recording:

- **Hourly instants.** Each Bangkok hour is the value at that instant, not an average. Open-Meteo's
  hourly values equal the ADS field for the same valid time to within 0.03 µg/m³ (its rounding).
- **Forecast hours, newest run first.** Each hour comes from the newest run that covers it, using
  the first 12 hours of each run: Bangkok hours 0 to 6 from the 12 UTC run of the day before (lead
  5 to 11), 7 to 18 from the 00 UTC run of the day (lead 0 to 11), 19 to 23 from the 12 UTC run of
  the day (lead 0 to 4). The "past" values are forecasts, not measurements.
- **One cell, not a blend.** Our grid points sit exactly halfway between four CAMS cells (the
  cells are at 89.2°E and 1.2°N, our points at 89.0°E and 1.0°N). Open-Meteo returns one of the
  four, and an exact tie is settled by float32 arithmetic: index = round((coordinate − origin) /
  0.4) with origin −90 (latitude) and −180 (longitude), and .5 rounds up. In practice ties go north
  93% of the time and east 78%.
- **Reproducible.** That run rule and cell rule reproduce all 4,599 stored values for 5 and 6 Nov
  to within 0.1 µg/m³ (mean absolute difference 0.004).

## Decision

**Fetch the grid from the ADS, with two runs, and resample with the mean of the four surrounding
cells.**

- **Runs.** The 12 UTC run of the day before for the first 7 Bangkok hours, the 00 UTC run of the
  day for the other 17. The 00 UTC run is published by 10:00 UTC, 13 hours before the 23:00 UTC job.
- **Resampling.** Each grid point is the mean of the four CAMS cells around it. No cell is
  favoured, so there is no directional bias.
- **Request area.** `[30.4, 88.8, 0.8, 114]`, one ring wider than the grid, so the edge points have
  all four neighbours. If a file does not cover a point, the job throws.
- **Completeness.** The job requires one field for each of the 24 hours. A partial day is never
  stored.
- **Storage.** Same `cams_grid` table, Redis key and API. Both sources **replace the day**:
  once the job holds the full grid (all 4,599 points) it deletes the date's rows, then inserts
  (an insert that fails is retried, because the day is already cleared). Open-Meteo stores its own rounding of the coordinates (29.800003), the ADS path stores
  29.8, so the upsert key `(date, lat, lng)` never matches across sources. Without the delete, a
  fallback run after an ADS run that died halfway through its inserts would leave both sets in the
  day. A partial fetch deletes nothing. There is no `source` column and no schema change.
- **Switch and fallback.** `CAMS_SOURCE=ads|openmeteo`, unset means `ads`. The fallback cron
  (03:00 UTC) always uses Open-Meteo. It runs an hour after the weather fallback (02:00), so the
  two grids never share Open-Meteo's hourly limit. If the ADS job fails, the fallback fills the day.
- **Decoder.** We decode the GRIB edition 1 files ourselves (simple packing, regular lat/lng grid,
  no bitmap). Anything else throws, so a change in the ADS output fails loudly.
- **Attribution.** The dataset is CC BY 4.0. The ADS gives no required wording beyond the licence,
  so we credit the Copernicus Atmosphere Monitoring Service (ECMWF), link the licence, and say the
  data is modified (daily mean, resampled). Open-Meteo stays credited for wind and weather. Days before the switch date, and fallback
  days, still hold Open-Meteo's CAMS values, and the PM2.5 lines credit only Copernicus. That is
  accepted: Open-Meteo serves the same CAMS data, and its credit stays in the wind and weather lines.

## Alternatives considered

- **Stay on Open-Meteo.** It keeps the history unbroken and costs nothing to build. It also keeps
  the 9,198 calls a day, with 401 calls of headroom per hour, and the connection failures.
- **One run (12 UTC of the day before, hours 5 to 28).** One request, and published 25 hours
  before the job. But the evening hours are forecasts up to 28 hours old. Against the stored grids
  it was further away than two runs (mean absolute difference 1.6 to 2.2, against 1.2 to 1.5).
- **Open-Meteo's three runs.** It is what Open-Meteo does. The third run, 12 UTC of the day, is
  published by 22:00 UTC, one hour before the job, so a late run would fail the day. The two-run
  rule keeps 13 hours of margin and the last 5 hours are 12 to 16 hour forecasts, not 0 to 4.
- **Copy Open-Meteo exactly (nearest cell with the float32 tie-break).** It reproduces the stored
  history almost exactly, so there would be no step. We rejected it: it copies an undocumented
  quirk that favours the north-east, and it ties our code to Open-Meteo's arithmetic. A step of
  1.4 µg/m³ is a small price for a rule we can explain.
- **A GRIB library (eccodes, via Python).** It would cover more formats. The file is edition 1
  with simple packing, so about 140 lines of Node decode it, tested against eccodes values.
  [JOO-98](https://linear.app/joostkiens/issue/JOO-98) plans to move ingest to Python; this job
  can be ported then.

## Consequences

- **A step in the history at the switch date.** Compared with the grids stored from Open-Meteo,
  three days of the new code (4 to 6 Nov) gave a mean absolute difference of 1.4 µg/m³, no bias
  (−0.11 to +0.07), and 5.5% to 6.2% of points more than 5 µg/m³ apart, up to 28 at hotspots.
  Values before and after the switch date are not exactly comparable.
- **No backfill, no re-baseline.** The daily p95 differs by at most 0.8 µg/m³ (stored 32.5, 35.5,
  35.5; ADS 32.5, 36.3, 35.5), so `cams_daily_summary` and the `/api/explain` baseline stay as they
  are.
- **A new secret.** `ADS_API_KEY` must be set on the `ingest-cams` service before deploying. Without
  it the job fails at once and the fallback cron runs. The key is sent to the ADS only, never to the
  host the file is downloaded from.
- **A rerun by hand replaces the day.** Either source, given the full grid, deletes the date's
  rows first, so a rerun with the other source swaps the whole day. An Open-Meteo run that skipped
  batches (4,000 to 4,598 points) still only adds the rows it has, so it never removes rows an
  earlier run saved. If an ADS run and then the fallback both fetch a partial grid, the
  day can still hold both coordinate sets; that needs two failures in a row.
- **Open-Meteo budget.** The CAMS job no longer uses it: a clean day is 4,599 of 10,000 calls
  (weather only). The weather job moved from 00:00 to 23:00 UTC, the CAMS job's hour, so
  yesterday can appear at about 06:30 Bangkok, not 07:10. That time is expected, not yet measured.
- **Not tested.** The ADS from Railway (Singapore), whether the ADS accepts `DELETE /jobs/{id}`
  to cancel a job that timed out (the client tries it and ignores a failure), and the ADS when a
  run is delayed (reports show
  2 to 3 hours after model upgrades). The measurements are three to five days in one season.
- **Not a measurement.** Both sources serve forecast hours of a model. The product text says
  "modelled", not "measured".
