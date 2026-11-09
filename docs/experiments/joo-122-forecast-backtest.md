# JOO-122: forecast backtest (CAMS, raw and bias-corrected)

Status: run 2026-11-05. Script: `pnpm --filter backend run backtest:forecast -- --start=2026-02-01 --end=2026-04-30` (`packages/backend/src/scripts/backtest-forecast.ts`, maths in `lib/forecastBacktest.ts`).

## Verdict

**The gate fails. Do not show a CAMS-based band for today.** Even in this optimistic proxy, the corrected CAMS value agrees with the measured Thai PCD band less often than "same as yesterday" does (67% vs 75% pooled). Raw CAMS is worse still (37%) and too optimistic 47% of the time. CAMS's day-to-day direction matched the measured direction only 51% of the time, so the "tomorrow: similar / better / worse" line is not supported either.

Recommendation: keep the verdict on yesterday's measured band. Do not ship the forecast block until a true day-ahead test (below) says otherwise.

## Method

- **Cities:** Chiang Mai, Chiang Rai, Lampang, Lamphun (from `data/cities.ts`) plus Phayao, Phrae, Mae Hong Son, Phitsanulok (script-local centres). Nan was skipped: 1 station within 20 km. Phayao, Mae Hong Son and Phitsanulok have only 2 stations, so their figures are noisy.
- **Measured city figure:** the production figure (`cityDay`): median of station daily means within 20 km, one decimal. Station daily means come from the OpenAQ S3 archive, not the database, because the season is older than the 140-day retention. The station list is today's `stations` table, so a station added after April is included.
- **CAMS:** Open-Meteo air-quality API, hourly `pm2_5`, daily mean in Bangkok time, at the 0.4° grid point nearest the city (the point the city page reads). Days with fewer than 20 hourly values are dropped.
- **Corrected value:** `CAMS(D) x clamp(measured(D-1) / CAMS(D-1))`, clamp 0.5 to 2. A 1/3 to 3 clamp is shown as a sensitivity run.
- **Persistence baseline:** the prediction for day D is the measured figure of D-1.
- **Safety rule (interpretation, to confirm):** the shown band is never better than yesterday's measured band unless the corrected value is at least 2 bands better. Worse is always shown. "A full band lower" in the issue is ambiguous; the last table runs the rule at 1 band (no rule).
- **Direction:** CAMS(D) vs CAMS(D-1) compared with measured(D) vs measured(D-1). Within 15% counts as similar.
- **Bands:** Thai PCD 24-hour PM2.5: 15.0 / 25.0 / 37.5 / 75.0 µg/m³.
- Period 2026-02-01 to 2026-04-30; 89 days per city (87 for Phitsanulok).

## Limits

- **This is a proxy, and it flatters CAMS.** Open-Meteo archives no day-ahead PM2.5 forecasts (`pm2_5_previous_day1` is null for Jan to Mar 2026). The CAMS series for day D is the model's analysis-like series, not a forecast made the day before. A real day-ahead forecast would score worse, so the verdict can only get worse.
- The yesterday term uses the same series, so the bias correction also has an easier job than in production.
- Persistence is a strong baseline in a haze season, because bands change slowly. That is part of the finding.
- Direction accuracy was not compared with an "always similar" baseline.
- Not tested: other lead times, other seasons, other models.

## Follow-up

To learn the true day-ahead accuracy, store the real forecast each day (raw value, issue time, city figure the next day) and re-run this comparison after a few weeks of the 2026/27 season. Out of scope for this task.

## Results

Copied from the script output (`## Pooled` onward).

## Pooled

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        37% |           87% |            47% |             16% |      -17.8 |      23.7 |
| Corrected                        |        67% |           98% |            18% |             15% |       -2.9 |      11.4 |
| Corrected + safety rule          |        72% |           98% |             7% |             21% |          – |         – |
| Persistence (yesterday’s figure) |        75% |           99% |            13% |             12% |        0.0 |       8.8 |

Tomorrow's direction (better / similar / worse) correct: 51%

### Per city

### Chiang Mai (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        47% |           94% |            43% |             10% |      -22.4 |      25.1 |
| Corrected                        |        74% |          100% |            16% |             10% |       -3.8 |      11.0 |
| Corrected + safety rule          |        79% |           99% |             4% |             17% |          – |         – |
| Persistence (yesterday’s figure) |        74% |           99% |            13% |             12% |       -0.1 |       9.7 |

Tomorrow's direction (better / similar / worse) correct: 60%

### Chiang Rai (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        54% |           91% |            25% |             21% |      -16.6 |      23.2 |
| Corrected                        |        67% |           98% |            15% |             18% |       -2.1 |      13.4 |
| Corrected + safety rule          |        66% |           97% |            10% |             24% |          – |         – |
| Persistence (yesterday’s figure) |        67% |           99% |            17% |             16% |        0.0 |      12.6 |

Tomorrow's direction (better / similar / worse) correct: 43%

### Lampang (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        29% |           83% |            70% |              1% |      -23.2 |      23.8 |
| Corrected                        |        63% |           99% |            27% |             10% |       -3.4 |      11.1 |
| Corrected + safety rule          |        72% |           99% |            11% |             17% |          – |         – |
| Persistence (yesterday’s figure) |        73% |          100% |            13% |             13% |        0.0 |       7.4 |

Tomorrow's direction (better / similar / worse) correct: 51%

### Lamphun (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        47% |           97% |            43% |             10% |      -17.7 |      20.9 |
| Corrected                        |        74% |          100% |            17% |              9% |       -0.6 |       9.2 |
| Corrected + safety rule          |        80% |           99% |             4% |             16% |          – |         – |
| Persistence (yesterday’s figure) |        80% |           98% |            10% |             10% |       -0.0 |       9.4 |

Tomorrow's direction (better / similar / worse) correct: 56%

### Phayao (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        29% |           88% |            62% |              9% |      -26.3 |      28.8 |
| Corrected                        |        71% |           99% |            18% |             11% |       -4.9 |      13.0 |
| Corrected + safety rule          |        75% |           99% |             7% |             18% |          – |         – |
| Persistence (yesterday’s figure) |        74% |           99% |            13% |             12% |        0.1 |       8.9 |

Tomorrow's direction (better / similar / worse) correct: 48%

### Phrae (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        36% |           91% |            43% |             21% |       -5.0 |      12.0 |
| Corrected                        |        57% |           96% |            22% |             20% |        0.8 |       9.7 |
| Corrected + safety rule          |        63% |           96% |            10% |             27% |          – |         – |
| Persistence (yesterday’s figure) |        67% |           99% |            17% |             16% |        0.1 |       7.2 |

Tomorrow's direction (better / similar / worse) correct: 45%

### Mae Hong Son (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        19% |           65% |            26% |             55% |       -6.1 |      30.0 |
| Corrected                        |        60% |           94% |            12% |             28% |       -4.1 |      13.5 |
| Corrected + safety rule          |        65% |           94% |             2% |             33% |          – |         – |
| Persistence (yesterday’s figure) |        85% |          100% |             8% |              7% |       -0.1 |       7.5 |

Tomorrow's direction (better / similar / worse) correct: 47%

### Phitsanulok (87 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        31% |           87% |            68% |              1% |      -25.1 |      25.7 |
| Corrected                        |        67% |          100% |            21% |             13% |       -5.4 |      10.4 |
| Corrected + safety rule          |        78% |          100% |             6% |             16% |          – |         – |
| Persistence (yesterday’s figure) |        79% |          100% |             9% |             11% |        0.3 |       8.0 |

Tomorrow's direction (better / similar / worse) correct: 56%

### Sensitivity: clamp 0.33–3 (pooled)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        37% |           87% |            47% |             16% |      -17.8 |      23.7 |
| Corrected                        |        69% |           99% |            16% |             15% |        0.8 |      10.8 |
| Corrected + safety rule          |        73% |           98% |             6% |             21% |          – |         – |
| Persistence (yesterday’s figure) |        75% |           99% |            13% |             12% |        0.0 |       8.8 |

Tomorrow's direction (better / similar / worse) correct: 51%

### Sensitivity: safety rule needs 1 band better (= no rule) (pooled)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        37% |           87% |            47% |             16% |      -17.8 |      23.7 |
| Corrected                        |        67% |           98% |            18% |             15% |       -2.9 |      11.4 |
| Corrected + safety rule          |        67% |           98% |            18% |             15% |          – |         – |
| Persistence (yesterday’s figure) |        75% |           99% |            13% |             12% |        0.0 |       8.8 |

Tomorrow's direction (better / similar / worse) correct: 51%
