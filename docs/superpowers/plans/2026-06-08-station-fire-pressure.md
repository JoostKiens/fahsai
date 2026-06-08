# Station Fire Pressure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the grid-cell `fire_pressure_scores` table with a per-station `station_fire_pressure` table computed using a true 75 km radius, eliminating the border-of-cell inaccuracy and the separate nightly cron job.

**Architecture:** A pure computation function in `jobs/station-fire-pressure.ts` bulk-loads all regional fires for a 14-day window ending at D-1, then runs haversine distance checks per station in-app — one DB round-trip for fires, one upsert. This second phase is appended to `runStationReadingsIngest` so it runs automatically after every readings ingest. The `explain.ts` lookup changes from snapped lat/lng to direct `(station_id, date)`. The old `fire_pressure_scores` table, its ingestion job, and its cron entry are all deleted.

**Tech Stack:** TypeScript, Supabase (Postgres), Vitest, pRetry — same stack as the rest of the backend.

---

## Design decisions (do not revisit)

| Decision | Resolution |
|---|---|
| Fire window | 14 days ending at D-1 (1-day lag is negligible for a 14-day rolling score) |
| Radius | 75 km (matches peer station radius; fixes cell-border artifacts) |
| Score formula | `min(100, (totalFrp / 9000) × log(1 + fireCount) × 10)` — denominator scaled from 1000 by area ratio (π×75²) / 44.4² ≈ 9× |
| Storage | New table `station_fire_pressure(station_id, date, ...)` with PK `(station_id, date)` |
| Computation placement | Second phase of `runStationReadingsIngest` — bulk load fires once, compute for all stations |
| Redis | Not needed — score is only ever read as part of the explain route, which caches the full response |
| Old infra | Delete `fire_pressure_scores` table, `ingest-fire-pressure.ts` job, `backfill-fire-pressure.ts` |

---

## Files

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/backend/src/db/migrations/027_station_fire_pressure.sql` | Create new table; drop old table |
| Create | `packages/backend/src/jobs/station-fire-pressure.ts` | Pure computation + DB upsert |
| Create | `packages/backend/src/jobs/station-fire-pressure.test.ts` | Unit tests for computation |
| Modify | `packages/backend/src/jobs/station-readings-ingest.ts` | Call fire pressure second phase |
| Modify | `packages/backend/src/routes/explain.ts` | Switch lookup to new table |
| Modify | `packages/backend/src/jobs/prune.ts` | Prune new table instead of old |
| Create | `packages/backend/src/scripts/backfill-station-fire-pressure.ts` | Historical backfill |
| Modify | `packages/backend/package.json` | Add backfill script; remove old fire-pressure scripts |
| Delete | `packages/backend/src/jobs/ingest-fire-pressure.ts` | Replaced by station-fire-pressure.ts |
| Delete | `packages/backend/src/scripts/ingest-fire-pressure.ts` | Replaced by backfill script |
| Delete | `packages/backend/src/scripts/backfill-fire-pressure.ts` | Replaced by backfill-station-fire-pressure.ts |
| Modify | `docs/claude/architecture.md` | Remove fire-pressure cron entry; update station-readings description |
| Modify | `docs/claude/database.md` | Replace fire_pressure_scores schema with station_fire_pressure |

---

## Task 1: Database migration

**Files:**
- Create: `packages/backend/src/db/migrations/027_station_fire_pressure.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 027_station_fire_pressure.sql
-- Replace grid-cell fire_pressure_scores with per-station 75 km radius scores.

CREATE TABLE IF NOT EXISTS station_fire_pressure (
  station_id   text         NOT NULL REFERENCES stations(id),
  date         date         NOT NULL,
  score        numeric(6,2) NOT NULL DEFAULT 0,
  fire_count   integer      NOT NULL DEFAULT 0,
  total_frp_mw numeric(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (station_id, date)
);

CREATE INDEX IF NOT EXISTS station_fire_pressure_date_idx ON station_fire_pressure (date);

-- Drop the old grid-cell table. All data in it is replaced by this migration.
DROP TABLE IF EXISTS fire_pressure_scores;
```

- [ ] **Step 2: Apply in Supabase**

Open the Supabase SQL editor for your project, paste the migration, and run it. Verify:
- `station_fire_pressure` appears in the table list
- `fire_pressure_scores` is gone

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/db/migrations/027_station_fire_pressure.sql
git commit -m "feat(db): replace fire_pressure_scores with station_fire_pressure (75 km radius)"
```

---

## Task 2: Computation job + unit tests

**Files:**
- Create: `packages/backend/src/jobs/station-fire-pressure.ts`
- Create: `packages/backend/src/jobs/station-fire-pressure.test.ts`

The exported computation function is pure (no DB calls) so it can be unit-tested without mocking Supabase. The DB-bound function `runStationFirePressure` is called from the ingest job in Task 3.

- [ ] **Step 1: Write failing tests**

Create `packages/backend/src/jobs/station-fire-pressure.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeStationFirePressureScores } from './station-fire-pressure.js';

const RADIUS_KM = 75;

describe('computeStationFirePressureScores', () => {
  const station = { id: 'st1', lat: 15.0, lng: 100.0 };

  it('returns score 0 when there are no fires', () => {
    const results = computeStationFirePressureScores([station], [], RADIUS_KM);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ stationId: 'st1', fireCount: 0, totalFrpMw: 0, score: 0 });
  });

  it('includes a fire exactly at the station', () => {
    const fires = [{ lat: 15.0, lng: 100.0, frp: 50 }];
    const results = computeStationFirePressureScores([station], fires, RADIUS_KM);
    expect(results[0].fireCount).toBe(1);
    expect(results[0].totalFrpMw).toBe(50);
  });

  it('excludes a fire beyond the radius', () => {
    // ~83 km north of station
    const fires = [{ lat: 15.75, lng: 100.0, frp: 100 }];
    const results = computeStationFirePressureScores([station], fires, RADIUS_KM);
    expect(results[0].fireCount).toBe(0);
    expect(results[0].score).toBe(0);
  });

  it('includes a fire just within the radius', () => {
    // ~67 km north of station
    const fires = [{ lat: 15.6, lng: 100.0, frp: 100 }];
    const results = computeStationFirePressureScores([station], fires, RADIUS_KM);
    expect(results[0].fireCount).toBe(1);
  });

  it('score caps at 100', () => {
    // 10,000 fires × 500 MW each = 5,000,000 MW — should saturate
    const fires = Array.from({ length: 10_000 }, () => ({ lat: 15.0, lng: 100.0, frp: 500 }));
    const results = computeStationFirePressureScores([station], fires, RADIUS_KM);
    expect(results[0].score).toBe(100);
  });

  it('treats null frp as 0', () => {
    const fires = [{ lat: 15.0, lng: 100.0, frp: null }];
    const results = computeStationFirePressureScores([station], fires, RADIUS_KM);
    expect(results[0].fireCount).toBe(1);
    expect(results[0].totalFrpMw).toBe(0);
  });

  it('computes score independently per station', () => {
    const stations = [
      { id: 'near', lat: 15.0, lng: 100.0 },
      { id: 'far', lat: 20.0, lng: 100.0 }, // ~555 km away from fire
    ];
    const fires = [{ lat: 15.0, lng: 100.0, frp: 200 }];
    const results = computeStationFirePressureScores(stations, fires, RADIUS_KM);
    const near = results.find((r) => r.stationId === 'near')!;
    const far = results.find((r) => r.stationId === 'far')!;
    expect(near.fireCount).toBe(1);
    expect(far.fireCount).toBe(0);
  });

  it('matches expected score formula for known inputs', () => {
    // 100 fires × 100 MW = 10,000 MW total FRP
    // score = min(100, (10000 / 9000) * log(101) * 10)
    //       = min(100, 1.111 * 4.615 * 10)
    //       ≈ min(100, 51.3) = 51.3 (rounded to 2dp)
    const fires = Array.from({ length: 100 }, () => ({ lat: 15.0, lng: 100.0, frp: 100 }));
    const results = computeStationFirePressureScores([station], fires, RADIUS_KM);
    expect(results[0].score).toBeCloseTo(51.3, 0);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter backend test src/jobs/station-fire-pressure.test.ts
```

Expected: `FAIL — Cannot find module './station-fire-pressure.js'`

- [ ] **Step 3: Implement the computation job**

Create `packages/backend/src/jobs/station-fire-pressure.ts`:

```typescript
import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import { haversineKm } from '../utils/geo.js';

const LOG = '[station-fire-pressure]';
const WINDOW_DAYS = 14;
const RADIUS_KM = 75;
const DB_BATCH_SIZE = 500;
const FIRE_PAGE_SIZE = 1000;

// Denominator scaled from 1000 by the area ratio of a 75 km circle vs a 44.4 km grid cell:
// (π × 75²) / (44.4²) ≈ 9.0 — preserves score semantics so firesAreLocal threshold stays valid.
const SCORE_DENOMINATOR = 9_000;

type FireRow = { lat: number; lng: number; frp: number | null };
type Station = { id: string; lat: number; lng: number };

export interface StationFirePressureResult {
  stationId: string;
  fireCount: number;
  totalFrpMw: number;
  score: number;
}

/**
 * Pure function — no DB access. Computes per-station fire pressure scores from
 * a pre-loaded fire dataset. Exported for unit testing.
 */
export function computeStationFirePressureScores(
  stations: Station[],
  fires: FireRow[],
  radiusKm = RADIUS_KM,
): StationFirePressureResult[] {
  return stations.map((station) => {
    // Bbox pre-filter before haversine (~0.76° lat/lng padding for 75 km at mid-Thailand lat)
    const latPad = radiusKm / 111;
    const lngPad = radiusKm / (111 * Math.cos((station.lat * Math.PI) / 180));
    const candidates = fires.filter(
      (f) =>
        Math.abs(f.lat - station.lat) <= latPad && Math.abs(f.lng - station.lng) <= lngPad,
    );

    let fireCount = 0;
    let totalFrpMw = 0;
    for (const fire of candidates) {
      if (haversineKm(station.lat, station.lng, fire.lat, fire.lng) <= radiusKm) {
        fireCount++;
        totalFrpMw += fire.frp ?? 0;
      }
    }

    const rawScore = (totalFrpMw / SCORE_DENOMINATOR) * Math.log(1 + fireCount) * 10;
    const score = Math.round(Math.min(100, rawScore) * 100) / 100;

    return { stationId: station.id, fireCount, totalFrpMw: Math.round(totalFrpMw * 100) / 100, score };
  });
}

/**
 * Loads fires for the 14-day window ending at D-1, computes scores for all active
 * stations, and upserts to station_fire_pressure.
 */
export async function runStationFirePressure(
  targetDate: string,
  stations: Station[],
): Promise<{ upserted: number }> {
  if (stations.length === 0) return { upserted: 0 };

  const dateMs = new Date(targetDate + 'T00:00:00Z').getTime();
  // Window: 14 days ending at D-1 (fires up to but not including targetDate)
  const windowStartIso = new Date(dateMs - WINDOW_DAYS * 86_400_000).toISOString();
  const windowEndIso = new Date(dateMs).toISOString();

  console.log(
    `${LOG} Loading fires for window ${windowStartIso.slice(0, 10)} – ${targetDate} (exclusive)`,
  );

  const allFires: FireRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('fire_points')
      .select('lat, lng, frp')
      .gte('detected_at', windowStartIso)
      .lt('detected_at', windowEndIso)
      .gte('lat', 1)
      .lte('lat', 30)
      .gte('lng', 89)
      .lte('lng', 114)
      .range(offset, offset + FIRE_PAGE_SIZE - 1);

    if (error) throw new Error(`${LOG} fire_points query failed: ${error.message}`);
    const rows = (data ?? []) as FireRow[];
    allFires.push(...rows);
    if (rows.length < FIRE_PAGE_SIZE) break;
    offset += FIRE_PAGE_SIZE;
  }

  console.log(`${LOG} ${allFires.length} fire detections loaded — computing for ${stations.length} stations`);

  const results = computeStationFirePressureScores(stations, allFires);

  const rows = results.map((r) => ({
    station_id: r.stationId,
    date: targetDate,
    score: r.score,
    fire_count: r.fireCount,
    total_frp_mw: r.totalFrpMw,
  }));

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('station_fire_pressure')
          .upsert(batch, { onConflict: 'station_id,date' });
        if (error)
          throw new AbortError(
            `${LOG} Upsert failed (batch ${Math.floor(i / DB_BATCH_SIZE) + 1}): ${error.message}`,
          );
      },
      { retries: 3, minTimeout: 1000, factor: 2 },
    );
  }

  console.log(`${LOG} ${targetDate} — ${rows.length} station scores upserted`);
  return { upserted: rows.length };
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter backend test src/jobs/station-fire-pressure.test.ts
```

Expected: all 7 tests PASS

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
pnpm --filter backend test
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/jobs/station-fire-pressure.ts \
        packages/backend/src/jobs/station-fire-pressure.test.ts
git commit -m "feat(jobs): add station-fire-pressure computation job (75 km radius, 14-day window)"
```

---

## Task 3: Integrate into station-readings-ingest

**Files:**
- Modify: `packages/backend/src/jobs/station-readings-ingest.ts`

The second phase runs after all readings are inserted. It reuses the `stationRows` already fetched at the start of the job (same query — stations with `pm25_sensor_ids`).

- [ ] **Step 1: Add the import and second phase**

In `packages/backend/src/jobs/station-readings-ingest.ts`, add the import at the top:

```typescript
import { runStationFirePressure } from './station-fire-pressure.js';
```

Then, in the `runStationReadingsIngest` function, replace the closing block (after the Redis invalidation, before `return`) with:

```typescript
  // --- second phase: station fire pressure ---
  // Uses fires up to D-1 (targetDate is exclusive) — ordering-safe regardless of
  // when ingest-fires runs for the same day.
  const stationsForPressure = (stationRows as { id: string; lat?: number; lng?: number }[])
    .filter((s): s is { id: string; lat: number; lng: number } =>
      s.lat !== undefined && s.lng !== undefined,
    );
  await runStationFirePressure(targetDate, stationsForPressure);

  console.log('[station-readings-ingest] Done');
  return { sensorsQueried, measurementsInserted: measurementRows.length };
```

> **Note:** The current `stationRows` query only selects `id, pm25_sensor_ids`. You need to also select `lat, lng`. Update the Supabase query to:
> ```typescript
> const { data: stationRows, error: stationsError } = await supabase
>   .from('stations')
>   .select('id, pm25_sensor_ids, lat, lng')
>   .filter('pm25_sensor_ids', 'not.eq', '{}');
> ```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter backend typecheck
```

Expected: no errors

- [ ] **Step 3: Lint**

```bash
pnpm --filter backend lint
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/jobs/station-readings-ingest.ts
git commit -m "feat(jobs): run station fire pressure as second phase of station-readings-ingest"
```

---

## Task 4: Update explain.ts lookup

**Files:**
- Modify: `packages/backend/src/routes/explain.ts`

Switch from `fire_pressure_scores` (lookup by snapped lat/lng) to `station_fire_pressure` (lookup by `station_id` and `date`).

- [ ] **Step 1: Replace the query and result handling**

Find and remove these lines (around line 188–189):
```typescript
const snapLat = Math.round(Math.round(lat / 0.4) * 0.4 * 1000) / 1000;
const snapLng = Math.round(Math.round(lng / 0.4) * 0.4 * 1000) / 1000;
```

In the parallel `Promise.all` array, find the `pressureResult` entry (currently `fire_pressure_scores` query) and replace it with:

```typescript
supabase
  .from('station_fire_pressure')
  .select('score, fire_count, total_frp_mw')
  .eq('station_id', stationId)
  .eq('date', d0)
  .maybeSingle(),
```

Find the `pressureData` cast (around line 574):
```typescript
const pressureData = pressureResult.data as {
  score: number;
  fire_count: number;
  total_frp: number;
} | null;
```

Replace with:
```typescript
const pressureData = pressureResult.data as {
  score: number;
  fire_count: number;
  total_frp_mw: number;
} | null;
```

Find the `areaTotalFrpMw` assignment:
```typescript
areaTotalFrpMw: pressureData?.total_frp ?? null,
```

Replace with:
```typescript
areaTotalFrpMw: pressureData?.total_frp_mw ?? null,
```

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm --filter backend typecheck && pnpm --filter backend lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/routes/explain.ts
git commit -m "feat(explain): look up area fire pressure from station_fire_pressure by station_id"
```

---

## Task 5: Update prune job

**Files:**
- Modify: `packages/backend/src/jobs/prune.ts`

Swap `fire_pressure_scores` for `station_fire_pressure` in the prune function.

- [ ] **Step 1: Replace the prune block**

In `packages/backend/src/jobs/prune.ts`, replace:

```typescript
  const { count: firePressureScoresDeleted, error: firePressureError } = await supabase
    .from('fire_pressure_scores')
    .delete({ count: 'exact' })
    .lt('date', fpCutoffDate);

  if (firePressureError) {
    throw new Error(`Failed to prune fire_pressure_scores: ${firePressureError.message}`);
  }
```

With:

```typescript
  const { count: stationFirePressureDeleted, error: stationFirePressureError } = await supabase
    .from('station_fire_pressure')
    .delete({ count: 'exact' })
    .lt('date', fpCutoffDate);

  if (stationFirePressureError) {
    throw new Error(`Failed to prune station_fire_pressure: ${stationFirePressureError.message}`);
  }
```

Update the return type, log line, and return object to use `stationFirePressureDeleted` instead of `firePressureScoresDeleted`. The return type interface changes:
```typescript
// Before
firePressureScoresDeleted: number;
// After
stationFirePressureDeleted: number;
```

The log line becomes:
```typescript
`[prune] Deleted ${firePointsDeleted ?? 0} fire_points, ${measurementsDeleted ?? 0} station_readings, ${aqGridDeleted ?? 0} cams_grid, ${weatherReadingsDeleted ?? 0} weather_readings, ${stationWeatherDeleted ?? 0} station_weather, ${stationFirePressureDeleted ?? 0} station_fire_pressure`,
```

Also remove the redundant `fpCutoff` / `fpCutoffDate` block — it duplicates `cutoffDate` already computed above. Use `cutoffDate` for the station fire pressure prune too.

- [ ] **Step 2: Typecheck and lint**

```bash
pnpm --filter backend typecheck && pnpm --filter backend lint
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/jobs/prune.ts
git commit -m "chore(jobs): prune station_fire_pressure instead of fire_pressure_scores"
```

---

## Task 6: Backfill script

**Files:**
- Create: `packages/backend/src/scripts/backfill-station-fire-pressure.ts`
- Modify: `packages/backend/package.json`

The backfill script loads all active stations once, then iterates dates and calls `runStationFirePressure` per date. Dates that already have rows (all stations present) are skipped.

- [ ] **Step 1: Create the backfill script**

```typescript
/**
 * Backfill station_fire_pressure for a date range.
 *
 * Usage:
 *   pnpm --filter backend run backfill:station-fire-pressure -- --start=YYYY-MM-DD --end=YYYY-MM-DD
 *
 * For each date, loads fires and computes 75 km radius scores for all active stations.
 * Dates where all active stations already have a row are skipped.
 * Max range: 130 days.
 */
import 'dotenv/config';
import { supabase } from '../db/client.js';
import { runStationFirePressure } from '../jobs/station-fire-pressure.js';

const LOG = '[backfill-station-fire-pressure]';
const MAX_DAYS = 130;

function parseDateFlag(flag: string): string {
  const val = process.argv.find((a) => a.startsWith(`--${flag}=`))?.slice(flag.length + 3);
  if (!val) {
    console.error(`${LOG} --${flag} is required (YYYY-MM-DD)`);
    process.exit(1);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    console.error(`${LOG} --${flag}: invalid format "${val}" — expected YYYY-MM-DD`);
    process.exit(1);
  }
  return val;
}

const startDate = parseDateFlag('start');
const endDate = parseDateFlag('end');

const startMs = new Date(startDate + 'T00:00:00Z').getTime();
const endMs = new Date(endDate + 'T00:00:00Z').getTime();

if (endMs < startMs) {
  console.error(`${LOG} --start must be before or equal to --end`);
  process.exit(1);
}

const diffDays = Math.round((endMs - startMs) / 86400000) + 1;
if (diffDays > MAX_DAYS) {
  console.error(`${LOG} Date range ${diffDays} days exceeds maximum ${MAX_DAYS} days`);
  process.exit(1);
}

const dates: string[] = [];
let cursor = startMs;
while (cursor <= endMs) {
  dates.push(new Date(cursor).toISOString().slice(0, 10));
  cursor += 86400000;
}

async function run() {
  const { data: stationRows, error } = await supabase
    .from('stations')
    .select('id, lat, lng')
    .filter('pm25_sensor_ids', 'not.eq', '{}');

  if (error) throw new Error(`${LOG} Failed to fetch stations: ${error.message}`);
  const stations = (stationRows ?? []) as { id: string; lat: number; lng: number }[];
  console.log(`${LOG} ${stations.length} active stations, ${dates.length} dates to process`);

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];

    // Skip if all stations already have a row for this date
    const { count } = await supabase
      .from('station_fire_pressure')
      .select('*', { count: 'exact', head: true })
      .eq('date', date);

    if ((count ?? 0) >= stations.length) {
      console.log(`[${i + 1}/${dates.length}] ${date} — skipped (${count} rows already present)`);
      continue;
    }

    await runStationFirePressure(date, stations);
    console.log(`[${i + 1}/${dates.length}] ${date} — done`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`${LOG} Fatal:`, err);
    process.exit(1);
  });
```

- [ ] **Step 2: Add scripts to package.json**

In `packages/backend/package.json`, add to the `scripts` object:

```json
"backfill:station-fire-pressure": "node --env-file=.env.local --import=tsx/esm src/scripts/backfill-station-fire-pressure.ts",
"railway:backfill:station-fire-pressure": "node --import=tsx/esm src/scripts/backfill-station-fire-pressure.ts",
```

Remove the old entries:
```json
"ingest:fire-pressure": "...",
"backfill:fire-pressure": "...",
"railway:ingest:fire-pressure": "...",
```

- [ ] **Step 3: Typecheck and lint**

```bash
pnpm --filter backend typecheck && pnpm --filter backend lint
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/scripts/backfill-station-fire-pressure.ts \
        packages/backend/package.json
git commit -m "feat(scripts): add backfill-station-fire-pressure script (75 km radius)"
```

---

## Task 7: Delete old infrastructure

**Files:**
- Delete: `packages/backend/src/jobs/ingest-fire-pressure.ts`
- Delete: `packages/backend/src/scripts/ingest-fire-pressure.ts`
- Delete: `packages/backend/src/scripts/backfill-fire-pressure.ts`

- [ ] **Step 1: Delete the files**

```bash
rm packages/backend/src/jobs/ingest-fire-pressure.ts
rm packages/backend/src/scripts/ingest-fire-pressure.ts
rm packages/backend/src/scripts/backfill-fire-pressure.ts
```

- [ ] **Step 2: Typecheck and lint to confirm no dangling imports**

```bash
pnpm --filter backend typecheck && pnpm --filter backend lint
```

Expected: no errors. If any import still references the deleted files, fix it now.

- [ ] **Step 3: Run full test suite**

```bash
pnpm --filter backend test
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "chore(jobs): remove ingest-fire-pressure and backfill-fire-pressure (replaced)"
```

---

## Task 8: Backfill production data + update docs

- [ ] **Step 1: Run the backfill**

Set `--start` to 130 days ago and `--end` to yesterday. Example (adjust dates):

```bash
pnpm --filter backend run backfill:station-fire-pressure -- --start=2026-01-28 --end=2026-06-07
```

Monitor the output: each date should log `— done` with a fire count. Verify a few rows in Supabase:

```sql
SELECT * FROM station_fire_pressure ORDER BY date DESC LIMIT 20;
```

Expected: one row per active station per date, `score` between 0 and 100, `fire_count` ≥ 0.

- [ ] **Step 2: Update architecture docs**

In `docs/claude/architecture.md`:

1. Remove the `fire-pressure-ingest` cron entry from the schedule table.
2. In the `station-readings-ingest` entry, add a note: "A second phase at the end of this job computes area fire pressure scores (75 km radius, 14-day window) for all active stations and upserts to `station_fire_pressure`."

- [ ] **Step 3: Update database docs**

In `docs/claude/database.md`, replace the `fire_pressure_scores` schema block with:

```sql
create table station_fire_pressure (
  station_id   text         not null references stations(id),
  date         date         not null,
  score        numeric(6,2) not null default 0,
  fire_count   integer      not null default 0,
  total_frp_mw numeric(10,2) not null default 0,
  primary key (station_id, date)
);
create index on station_fire_pressure (date);
-- Pruned at 100-day retention by prune job.
```

Also update the Railway cron schedule section to remove the fire-pressure cron line, and update the retention table if it lists `fire_pressure_scores`.

- [ ] **Step 4: Commit**

```bash
git add docs/claude/architecture.md docs/claude/database.md
git commit -m "docs: update architecture + db schema for station_fire_pressure migration"
```

---

## Acceptance criteria

1. `pnpm typecheck && pnpm lint` — no errors
2. `pnpm --filter backend test` — all tests pass including the 7 new unit tests
3. `station_fire_pressure` has rows for all active stations × last 130 days
4. `fire_pressure_scores` table is gone from Supabase
5. `/api/explain` returns `areaScore`, `areaFireCount`, `areaTotalFrpMw` from the new table
6. Stations on the cell boundary of the old grid now get a score that reflects fires within 75 km of the actual station coordinates
7. `station-readings-ingest` logs a fire pressure upsert line after each successful run
