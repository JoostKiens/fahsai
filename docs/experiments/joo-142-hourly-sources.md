# JOO-142: OpenAQ hourly freshness and request budget, ADS forecast lead hours

Status: measured 2026-11-21 to 2026-11-24. Scripts: `packages/backend/src/scripts/spike/` (one per
question). Run each from `packages/backend` with `node --env-file=.env.local --import=tsx/esm <script>`.

## Verdict

- **OpenAQ endpoint:** `/locations/{id}/latest`, one call per footprint location. Keep the freshest
  PM2.5 sensor of each location.
- **OpenAQ poll time:** :45 past the hour. At :45 every live location has the value for the hour
  that started 45 minutes earlier.
- **OpenAQ budget:** one run is 225 calls, about 4 minutes at 1.1 s spacing. That fits the
  2,000-an-hour limit, including in the hour when the daily ingest (~700 calls) shares the key.
- **CAMS horizon:** request lead hours 0–120. It costs about the same as today's 0–16: under 35 s
  per job, 1.7 MB, 33 ms to decode.
- **CAMS poll times:** 11:00 UTC for the 00 UTC run and 23:00 UTC for the 12 UTC run. Runs appeared
  9.3 to 10.4 h after the run time. The two slots leave at least 35 minutes of margin.

## Method

| Question                   | Script                    | Command arguments                                                      |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Q1 freshness               | `openaq-freshness.ts`     | `--hours=6 --out=<file>`; `--summarize=<file>`                         |
| Q2, Q3 endpoint and budget | `openaq-endpoints.ts`     | none                                                                   |
| Q4 ADS timing              | `ads-lead-hours.ts`       | `--run-date=YYYY-MM-DD --time=00:00 --max-lead=16,72,120 --out=<file>` |
| Q5 run availability        | `ads-run-availability.ts` | `--runs=N --out=<file>`; `--check=YYYY-MM-DDTHH --out=<file>`          |

- **Footprint:** the union of `fetchCityStations` over the 5 cities in `data/cities.ts` (the
  production footprint, 20 km radius).
- **Freshness:** 20 Chiang Mai locations (active in the last 30 days, with a PM2.5 sensor) sampled at
  :00, :15, :30 and :45 from 12:45 to 18:30 UTC on 21 Nov. 24 samples, 480 rows. Age = sample time
  minus the timestamp of the freshest PM2.5 value.
- **ADS timing:** one job per size, one after the other, in two passes (21 Nov 12:36 and 23:42 UTC).
  Queue time is submit to `successful`, measured by wrapping `fetch` in `fetchCamsGrib`.
- **Run availability:** from 4 h after the run time, one request every 20 minutes, for lead hour 0
  and lead hour 120 separately, until each succeeds.

## Findings

### Q1: freshness (Chiang Mai, minutes since the value's timestamp)

| Provider    | Rows per mark | :00 | :15 | :30 (median / p90) | :45 |
| ----------- | ------------: | --: | --: | -----------------: | --: |
| AirGradient |           108 |  60 |  75 |            30 / 30 |  45 |
| Air4Thai    |            12 |  60 |  75 |            30 / 90 |  45 |

- The new hourly value arrives between :15 and :30.
- At :30, every AirGradient location had it. Air4Thai had it in 8 of 12 rows.
- At :45, every location had it, for both providers.
- A value stamped 12:00 is first seen around 12:30. The timestamp is probably the end of the
  measured hour (not verified against provider docs).

### Q2: which endpoint

| Endpoint                               | Calls per run | Median ms | Result                                             |
| -------------------------------------- | ------------: | --------: | -------------------------------------------------- |
| `/locations/{id}/latest`               |           225 |       336 | 133 locations with PM2.5 in the last 2 h           |
| `/parameters/2/latest` (global, paged) |            11 |       994 | Only 103 of those 133                              |
| `/sensors/{id}/hours`                  |  1 per sensor |       338 | One hour behind `/latest` (5 of 5 sensors checked) |
| `/locations?coordinates`               |    1 per city |       582 | Lists locations; no values                         |

- `/parameters/2/latest` ignores `bbox` and `coordinates`, so it pages through the whole world. Its
  pages have no stable order: 10,150 rows held only 7,401 unique sensors. It silently drops
  locations. Rejected.
- `/sensors/{id}/hours` is one call per sensor (more than per location) and lags an hour. Rejected.
- The rate limit headers confirm 60 a minute (`x-ratelimit-limit`).

### Q3: footprint size and cost

- 225 locations in all 5 footprints together; 156 have a PM2.5 sensor in `stations`; 133 had a PM2.5
  value in the last 2 h.
- The Chiang Mai footprint matches OpenAQ's own 20 km radius query: 44 locations both ways.
- One hourly run: 225 calls. At 1.1 s spacing that is about 4 minutes and stays under 60 a minute.
- Calls per hour: 225, plus ~700 in the hour the daily `ingest:station-readings` runs. Both fit under
  2,000. Do not schedule the two at the same minute, or the per-minute limit is shared.
- Could shrink to the 156 locations with a PM2.5 sensor. Not needed for the budget.

### Q4: ADS request size

| Lead hours   | Total s (2 passes) | Queue s | File MB | Decode ms | Messages |
| ------------ | ------------------ | ------- | ------: | --------- | -------: |
| 0–16 (today) | 25, 24             | 21, 22  |     0.2 | 5, 14     |       17 |
| 0–72         | 18, 35             | 16, 32  |     1.0 | 14, 30    |       73 |
| 0–120        | 29, 28             | 26, 25  |     1.7 | 32, 33    |      121 |

- Queue time dominates and does not grow with the horizon. Download is at most 1 s.
- Peak RSS was 62 MB.
- The 0–16 file matches production's size (246,636 bytes). Production `ingest-cams` logs show jobs
  of 20–60 s, so these timings are typical.

### Q5: when runs appear on the ADS

| Run           | Last "not yet"   | First available  |
| ------------- | ---------------- | ---------------- |
| 21 Nov 12 UTC | 22:00 (+10.0 h)  | 22:20 (+10.33 h) |
| 22 Nov 00 UTC | 09:20 (+9.33 h)  | 09:40 (+9.67 h)  |
| 23 Nov 00 UTC | 10:04 (+10.07 h) | 10:24 (+10.4 h)  |
| 23 Nov 12 UTC | 21:59 (+10.0 h)  | 22:19 (+10.33 h) |
| 24 Nov 00 UTC | 10:00 (+10.0 h)  | 10:20 (+10.33 h) |

- Lead hour 0 and lead hour 120 always appeared in the same probe: a run is published whole.
- Latest seen: +10.4 h. 11:00 and 23:00 UTC are +11 h, 35 minutes after the latest first
  sighting.

## Notes for JOO-138 and JOO-140

- **The ADS answers an unpublished run with HTTP 400**, "Request has not produced a valid
  combination of values". It does not queue the job. `fetchCamsGrib` treats any 4xx except 429 as
  fatal, so a job that polls too early fails at once instead of waiting. Schedule after +11 h, or
  treat this 400 as "retry later".
- **`pm25_sensor_ids[0]` is not always the live sensor.** It was the freshest PM2.5 sensor at only
  124 of 156 locations. Some locations keep a retired PM2.5 sensor that still returns an old value.
  The daily ingest reads only `[0]`. The hourly job should pick the freshest PM2.5 sensor.
- **`OpenAQLocation.sensors[].latest` does not exist** in the `/locations` response, although the
  type in `utils/openaq.ts` declares it.
- The OpenAQ key is shared with the daily ingest. Offset the hourly job's minute from it.

## Limits

- Freshness was sampled for 6 hours of one day, in Chiang Mai only, with 18 AirGradient and 2 Air4Thai locations
  (12 Air4Thai rows per minute mark). Air4Thai's :30 spread rests on few samples.
- The laptop slept twice: 21 Nov 22:23–23:05 UTC (it delayed the second timing pass) and 23 Nov
  20:13–20:59 UTC (two early probes of the 23 Nov 12 UTC run lost; its bracket is intact). The
  22 Nov 12 UTC run was not measured.
- ADS timing is two passes per size. Queue time depends on ADS load, so treat it as typical, not
  worst case.
- Publish times are five runs in one week. A slow ADS day could exceed +10.4 h.
