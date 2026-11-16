# JOO-122: forecast backtest (CAMS, raw and bias-corrected)

Status: run 2026-11-05, re-run 2026-11-16 with the day cut fixed (see Method). Script: `pnpm --filter backend run backtest:forecast -- --start=2026-02-01 --end=2026-04-30` (`packages/backend/src/scripts/backtest-forecast.ts`, maths in `lib/forecastBacktest.ts`).

## Verdict

**The gate fails. Do not show a CAMS-based band for today.** Even in this optimistic proxy, the corrected CAMS value agrees with the measured Thai PCD band less often than "same as yesterday" does (64% vs 75% pooled), and less often in every one of the 8 cities. Raw CAMS is worse still (36%) and too optimistic 47% of the time. With the safety rule the pooled figure is 70%; it beats persistence only in Chiang Mai (76% vs 74%). CAMS's day-to-day direction matched the measured direction only 47% of the time, so the "tomorrow: similar / better / worse" line is not supported either.

Recommendation: keep the verdict on yesterday's measured band. Do not ship the forecast block until a true day-ahead test (below) says otherwise.

## Method

- **Cities:** Chiang Mai, Chiang Rai, Lampang, Lamphun (from `data/cities.ts`) plus Phayao, Phrae, Mae Hong Son, Phitsanulok (script-local centres). Nan was skipped: 1 station within 20 km. Phayao, Mae Hong Son and Phitsanulok have only 2 stations, so their figures are noisy.
- **Measured city figure:** the production figure (`cityDay`): median of station daily means within 20 km, one decimal. Station daily means come from the OpenAQ S3 archive, not the database, because the season is older than the 140-day retention. The station list is today's `stations` table, so a station added after April is included.
- **Day cut: UTC for both series.** Each S3 file holds one UTC day (07:00 to 07:00 Bangkok), so CAMS daily means are taken over UTC days too. The first run (2026-11-05) cut CAMS at Bangkok midnight, which shifted the two series 7 hours apart. Aligning them lowered CAMS's scores slightly (corrected exact band 67% to 64%, direction 51% to 47%) and left persistence unchanged, so the misalignment was not why CAMS lost.
- **CAMS:** Open-Meteo air-quality API, hourly `pm2_5`, daily mean per UTC day, at the 0.4° grid point nearest the city (the point the city page reads). Days with fewer than 20 hourly values are dropped.
- **Corrected value:** `CAMS(D) x clamp(measured(D-1) / CAMS(D-1))`, clamp 0.5 to 2. A 1/3 to 3 clamp is shown as a sensitivity run.
- **Persistence baseline:** the prediction for day D is the measured figure of D-1.
- **Safety rule (interpretation, to confirm):** the shown band is never better than yesterday's measured band unless the corrected value is at least 2 bands better. Worse is always shown. "A full band lower" in the issue is ambiguous; the last table runs the rule at 1 band (no rule).
- **Direction:** CAMS(D) vs CAMS(D-1) compared with measured(D) vs measured(D-1). Within 15% counts as similar.
- **Bands:** Thai PCD 24-hour PM2.5: 15.0 / 25.0 / 37.5 / 75.0 µg/m³.
- Period 2026-02-01 to 2026-04-30; 89 days per city (87 for Phitsanulok).

## Why it fails

From day-by-day traces of Chiang Mai, Chiang Rai and Lampang (9 March days, three per city, each one a day on which the measured band changed). The traces used the old Bangkok-day cut for CAMS, so their CAMS figures are approximate; the measured figures are unaffected.

- **Nothing catches the haze onset.** On 25 to 27 March all three cities moved from band 3 to band 4. Corrected CAMS and persistence both predicted band 3. Onset days are when a warning matters most.
- **CAMS reads about half the measured value in heavy haze.** On 25 March the measured/CAMS ratio was above 2 in Chiang Mai and Lampang, so the 0.5 to 2 clamp capped the correction and the corrected value stayed in band 3. The wider clamp helps only a little (66% pooled).
- **The safety rule can make a correct forecast wrong.** Lampang, 14 March: corrected CAMS gave band 1, the measured band was 1, and the rule raised it to band 2 because the day before was band 2.
- **Chiang Rai is one station.** Only 1 of its 3 stations reported on the traced days, so its city figure is that station's mean. The 2-station minimum counts stations nearby, not stations reporting. Treat its results as weak.

## Limits

- **This is a proxy, and it flatters CAMS.** Open-Meteo archives no day-ahead PM2.5 forecasts (`pm2_5_previous_day1` is null for Jan to Mar 2026). The CAMS series for day D is the model's analysis-like series, not a forecast made the day before. A real day-ahead forecast would score worse, so the verdict can only get worse.
- The yesterday term uses the same series, so the bias correction also has an easier job than in production.
- Persistence is a strong baseline in a haze season, because bands change slowly. That is part of the finding.
- Measured station-days have no minimum number of hourly readings, unlike CAMS days (20). Some station-days rest on 9 to 12 readings.
- Direction accuracy was not compared with an "always similar" baseline.
- Not tested: other lead times, other seasons, other models.

## Follow-up

To learn the true day-ahead accuracy, store the real forecast each day (raw value, issue time, city figure the next day) and re-run this comparison after a few weeks of the 2026/27 season. Out of scope for this task.

## Results

Copied from the 2026-11-16 script output (`## Pooled` onward), each heading one level down.

### Pooled

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        36% |           86% |            47% |             17% |      -17.8 |      23.8 |
| Corrected                        |        64% |           98% |            20% |             17% |       -3.2 |      11.9 |
| Corrected + safety rule          |        70% |           98% |             7% |             23% |          – |         – |
| Persistence (yesterday’s figure) |        75% |           99% |            13% |             12% |        0.0 |       8.8 |

Tomorrow's direction (better / similar / worse) correct: 47%

### Per city

#### Chiang Mai (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        43% |           98% |            45% |             12% |      -22.4 |      25.3 |
| Corrected                        |        66% |          100% |            20% |             13% |       -3.7 |      12.0 |
| Corrected + safety rule          |        76% |           99% |             8% |             16% |          – |         – |
| Persistence (yesterday’s figure) |        74% |           99% |            13% |             12% |       -0.1 |       9.7 |

Tomorrow's direction (better / similar / worse) correct: 55%

#### Chiang Rai (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        48% |           90% |            27% |             25% |      -16.6 |      23.5 |
| Corrected                        |        62% |           94% |            20% |             18% |       -2.7 |      15.0 |
| Corrected + safety rule          |        62% |           96% |            16% |             22% |          – |         – |
| Persistence (yesterday’s figure) |        67% |           99% |            17% |             16% |        0.0 |      12.6 |

Tomorrow's direction (better / similar / worse) correct: 37%

#### Lampang (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        33% |           82% |            66% |              1% |      -23.2 |      23.9 |
| Corrected                        |        55% |           98% |            27% |             18% |       -3.9 |      10.8 |
| Corrected + safety rule          |        69% |           99% |             9% |             22% |          – |         – |
| Persistence (yesterday’s figure) |        73% |          100% |            13% |             13% |        0.0 |       7.4 |

Tomorrow's direction (better / similar / worse) correct: 51%

#### Lamphun (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        47% |           98% |            42% |             11% |      -17.7 |      21.1 |
| Corrected                        |        69% |           99% |            19% |             12% |       -0.9 |      10.3 |
| Corrected + safety rule          |        74% |           98% |             6% |             20% |          – |         – |
| Persistence (yesterday’s figure) |        80% |           98% |            10% |             10% |       -0.0 |       9.4 |

Tomorrow's direction (better / similar / worse) correct: 53%

#### Phayao (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        28% |           88% |            62% |             10% |      -26.2 |      28.9 |
| Corrected                        |        70% |           99% |            18% |             12% |       -4.8 |      12.4 |
| Corrected + safety rule          |        72% |           99% |             7% |             21% |          – |         – |
| Persistence (yesterday’s figure) |        74% |           99% |            13% |             12% |        0.1 |       8.9 |

Tomorrow's direction (better / similar / worse) correct: 49%

#### Phrae (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        37% |           91% |            40% |             22% |       -5.0 |      11.7 |
| Corrected                        |        60% |           99% |            20% |             20% |        0.6 |       9.5 |
| Corrected + safety rule          |        66% |           99% |             7% |             27% |          – |         – |
| Persistence (yesterday’s figure) |        67% |           99% |            17% |             16% |        0.1 |       7.2 |

Tomorrow's direction (better / similar / worse) correct: 39%

#### Mae Hong Son (89 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        20% |           61% |            26% |             54% |       -6.1 |      30.2 |
| Corrected                        |        57% |           96% |            10% |             33% |       -4.5 |      13.3 |
| Corrected + safety rule          |        62% |           96% |             2% |             36% |          – |         – |
| Persistence (yesterday’s figure) |        85% |          100% |             8% |              7% |       -0.1 |       7.5 |

Tomorrow's direction (better / similar / worse) correct: 42%

#### Phitsanulok (87 days)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        29% |           84% |            70% |              1% |      -25.1 |      25.7 |
| Corrected                        |        70% |           99% |            22% |              8% |       -5.5 |      11.8 |
| Corrected + safety rule          |        77% |           99% |             6% |             17% |          – |         – |
| Persistence (yesterday’s figure) |        79% |          100% |             9% |             11% |        0.3 |       8.0 |

Tomorrow's direction (better / similar / worse) correct: 47%

### Sensitivity: clamp 0.33–3 (pooled)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        36% |           86% |            47% |             17% |      -17.8 |      23.8 |
| Corrected                        |        66% |           98% |            17% |             16% |        0.5 |      11.4 |
| Corrected + safety rule          |        71% |           98% |             7% |             22% |          – |         – |
| Persistence (yesterday’s figure) |        75% |           99% |            13% |             12% |        0.0 |       8.8 |

Tomorrow's direction (better / similar / worse) correct: 47%

### Sensitivity: safety rule needs 1 band better (= no rule) (pooled)

| Method                           | Exact band | Within 1 band | Too optimistic | Too pessimistic | Bias µg/m³ | MAE µg/m³ |
| -------------------------------- | ---------: | ------------: | -------------: | --------------: | ---------: | --------: |
| Raw CAMS                         |        36% |           86% |            47% |             17% |      -17.8 |      23.8 |
| Corrected                        |        64% |           98% |            20% |             17% |       -3.2 |      11.9 |
| Corrected + safety rule          |        64% |           98% |            20% |             17% |          – |         – |
| Persistence (yesterday’s figure) |        75% |           99% |            13% |             12% |        0.0 |       8.8 |

Tomorrow's direction (better / similar / worse) correct: 47%
