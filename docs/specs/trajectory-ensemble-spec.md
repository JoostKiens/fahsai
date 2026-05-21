# Spec: Back-trajectory ensemble context for `/api/explain`

## What this solves

The current `explain` endpoint uses a single wind vector at the station to
identify upwind fires and urban sources. This misses two important realities:

1. **Pollution accumulates over days**, not just from the current wind direction.
   A station can be showing elevated PM2.5 from fires that burned 60–200 km away
   2–3 days ago under different wind conditions.

2. **A single trajectory is falsely precise.** Wind fields have spatial variance;
   a small ensemble of traces gives an honest influence region rather than a
   single line.

This spec replaces the current single-point wind lookup and fixed-radius fire
query with a 3-day backward trajectory ensemble. The ensemble footprint is used
to accumulate fire pressure, CAMS PM2.5, urban sources, industrial zones, and
power plants into the Gemini prompt.

---

## Overview of changes

| File | Change |
|------|--------|
| `packages/backend/src/utils/trajectory.ts` | New file — pure computation, no I/O |
| `packages/backend/src/routes/explain.ts` | Replace wind/fire/urban logic; rewrite prompt |
| `packages/backend/src/data/urbanSources.ts` | Add `power_plant` type + `emissionProxy` field |
| `docs/claude/` or `CLAUDE.md` | Add trajectory section |

No new DB tables. No new env vars. No new ingestion jobs. No frontend changes.

---

## Step 1 — `packages/backend/src/utils/trajectory.ts`

Create this file. It is pure computation — no imports from Supabase, Redis, or
Fastify. Export everything needed by `explain.ts`.

### Types

```ts
export interface WindGridPoint {
  lat: number
  lng: number
  wind_speed_kmh: number
  wind_direction_deg: number // meteorological FROM direction
}

export interface TrajectoryWaypoint {
  lat: number
  lng: number
  date: string       // YYYY-MM-DD — which day's wind grid was used
  stepIndex: number  // 0 = station position, N = furthest back
}

export interface EnsembleResult {
  /** All waypoint paths, one per ensemble member. Index 0 is the center member. */
  members: TrajectoryWaypoint[][]
  /** Bounding box covering all waypoints + corridorKm padding */
  footprintBbox: { latMin: number; latMax: number; lngMin: number; lngMax: number }
  /** Dynamic corridor width in km, derived from mean wind speed */
  corridorKm: number
  /** Mean wind speed across all grid points used, km/h */
  meanWindSpeedKmh: number
}
```

### Constants

```ts
const STEP_HOURS = 6
const STEPS = 12        // 6h × 12 = 72h look-back
const KMH_TO_DEG_LAT = 1 / 111
const ENSEMBLE_OFFSET_DEG = 0.4  // ~44 km, one grid cell
```

### `traceBackTrajectory` (internal, not exported)

Traces a single back-trajectory from a starting position through 3 days of wind
grids.

```ts
function traceBackTrajectory(
  startLat: number,
  startLng: number,
  selectedDate: string,
  windGridsByDate: Map<string, WindGridPoint[]>,
): TrajectoryWaypoint[]
```

Algorithm per step `i` from 1 to STEPS:
- `hoursBack = i * STEP_HOURS`
- `stepDate = offsetDate(selectedDate, -Math.floor(hoursBack / 24))`
- Fetch grid for `stepDate` from the map. If absent or empty → stop trace.
- Find nearest grid point to current `(x, y)` position.
- Compute reverse travel direction:
  `travelRad = ((windDir + 180) % 360) * (Math.PI / 180)`
  This is the direction air *arrived from* — stepping backward means moving
  *opposite* to where the wind is blowing, i.e. backward along the transport
  path. The +180 converts the FROM direction to the TO direction, then we
  subtract the displacement.
- Update position:
  ```ts
  const cosLat = Math.max(Math.cos((y * Math.PI) / 180), 0.1)
  const kmhToDegLng = 1 / (111 * cosLat)
  x -= Math.sin(travelRad) * windSpeed * STEP_HOURS * kmhToDegLng
  y -= Math.cos(travelRad) * windSpeed * STEP_HOURS * KMH_TO_DEG_LAT
  ```
- Append waypoint.

### `traceEnsemble` (exported)

Runs 5 trajectory members — center + 4 cardinal offsets — and returns the
combined `EnsembleResult`.

```ts
export function traceEnsemble(
  stationLat: number,
  stationLng: number,
  selectedDate: string,
  windGridsByDate: Map<string, WindGridPoint[]>,
): EnsembleResult
```

Starting offsets (in degrees):
```ts
const offsets = [
  { dlat: 0,                     dlng: 0 },                     // center
  { dlat: ENSEMBLE_OFFSET_DEG,   dlng: 0 },                     // north
  { dlat: -ENSEMBLE_OFFSET_DEG,  dlng: 0 },                     // south
  { dlat: 0,                     dlng: ENSEMBLE_OFFSET_DEG },   // east
  { dlat: 0,                     dlng: -ENSEMBLE_OFFSET_DEG },  // west
]
```

After tracing all members:

**`corridorKm`** — computed from the mean wind speed across all grid points in
`wind0` (the current day's grid). Clamped:
```ts
corridorKm = Math.min(400, Math.max(75, meanWindSpeedKmh * 24 * 0.5))
```
If no wind data is available, default `corridorKm = 150`.

**`footprintBbox`** — collect all waypoint `lat`/`lng` values across all members,
add `corridorKm / 111` degrees of padding on all sides.

**`meanWindSpeedKmh`** — average of `wind_speed_kmh` across all points in `wind0`.
If `wind0` is empty, use 20 as default.

### Helper functions (exported — needed by `explain.ts`)

```ts
/** Returns date offset by `days` days from `dateStr` (YYYY-MM-DD) */
export function offsetDate(dateStr: string, days: number): string

/** Returns nearest WindGridPoint to (lng, lat) in a grid array */
export function nearestGridPoint(
  lng: number,
  lat: number,
  grid: WindGridPoint[],
): WindGridPoint

/** Haversine distance in km between two lat/lng points */
export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number

/** Bearing in degrees (0–360) from point A to point B */
export function bearingDeg(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): number
```

---

## Step 2 — `packages/backend/src/data/urbanSources.ts`

### Schema change

Add two new fields to the source type:

```ts
export type SourceType = 'megacity' | 'city' | 'industrial' | 'power_plant'

export interface UrbanSource {
  name: string
  country: string
  lat: number
  lng: number
  type: SourceType
  /** For cities/megacities: approximate population. For industrial/power_plant: 0. */
  population: number
  /**
   * For power_plant: installed capacity in MW. For industrial: approximate
   * relative emission weight (1–10 scale). For cities: 0.
   * Used in influence scoring alongside population.
   */
  emissionProxy: number
}
```

### Influence score

The influence score formula used in `explain.ts` should become:

```ts
const populationScore = source.population / (distKm ** 2)
const emissionScore = (source.emissionProxy * 10_000) / (distKm ** 2)
influenceScore = populationScore + emissionScore
```

This means a 2,000 MW power plant (`emissionProxy: 2000`) can compete in score
with a mid-sized city at similar distance, which is appropriate — large coal
plants are major PM2.5 contributors.

### Data

Add `power_plant` entries for the major coal and gas plants already on the map.
Match the names from the `power_plants` DB table. Include at minimum:

- Mae Moh (coal, ~2,400 MW, northern Thailand) — `emissionProxy: 2400`
- Krabi (coal) — `emissionProxy: 800`
- Map Ta Phut area plants (industrial coast, Rayong) — `emissionProxy: 1500`
- Major Myanmar coal plants if present in existing DB

Do not add plants that are not already in the power_plants DB table — the goal
is alignment, not exhaustiveness.

Keep `population: 0` for all `power_plant` and `industrial` entries.

---

## Step 3 — `packages/backend/src/routes/explain.ts`

### Wind grid fetching

Replace the single wind Redis lookup with a helper that fetches 3 dates, trying
Redis first and falling back to Supabase:

```ts
async function getWindGrid(date: string): Promise<WindGridPoint[]> {
  const cached = await redis.get<WindGridPoint[]>(`weather:${date}`)
  if (cached?.length) return cached
  const { data } = await supabase
    .from('weather_readings')
    .select('lat, lng, wind_speed_kmh, wind_direction_deg')
    .eq('date', date)
  if (!data?.length) return []
  await redis.set(`weather:${date}`, data, { ex: 86400 })
  return data as WindGridPoint[]
}
```

In the main handler, compute the 3 dates before `Promise.all`:

```ts
const d0 = selectedDate
const d1 = offsetDate(selectedDate, -1)
const d2 = offsetDate(selectedDate, -2)
```

Then fetch all in parallel alongside existing queries:

```ts
const [stationRows, fireRows, peerRows, camsRows, wind0, wind1, wind2] = await Promise.all([
  // ...existing queries — do not change them...
  supabase.from('cams_grid').select('lat, lng, pm25').eq('date', selectedDate),
  getWindGrid(d0),
  getWindGrid(d1),
  getWindGrid(d2),
])
```

Check CAMS Redis cache before the Supabase query. Inspect the codebase for the
existing CAMS Redis key pattern (likely `cams:${date}`) and use it. If not
cached, run the Supabase query and cache the result with `ex: 86400`.

### Trajectory computation

After fetching:

```ts
import { traceEnsemble, offsetDate, nearestGridPoint, haversineKm } from '../utils/trajectory.js'

const windGridsByDate = new Map([
  [d0, wind0],
  [d1, wind1],
  [d2, wind2],
])

const ensemble = traceEnsemble(lat, lng, selectedDate, windGridsByDate)
const { footprintBbox, corridorKm, members, meanWindSpeedKmh } = ensemble
const centerTrajectory = members[0]
const originWaypoint = centerTrajectory[centerTrajectory.length - 1]
```

### Fire query

Replace the old bounding box constants and time window. Use `footprintBbox` and
a 72h window:

```ts
const since72h = new Date(anchorEndMs - 72 * 3600_000).toISOString()

// Fire query uses footprintBbox instead of old BOX_FIRE constants
const fireQuery = supabase
  .from('fire_points')
  .select('lat, lng, frp, confidence, acquired_at')
  .gte('lat', footprintBbox.latMin)
  .lte('lat', footprintBbox.latMax)
  .gte('lng', footprintBbox.lngMin)
  .lte('lng', footprintBbox.lngMax)
  .gte('acquired_at', since72h)
```

After fetching fires, filter to those within `corridorKm` of **any** waypoint
across **all** ensemble members:

```ts
const allWaypoints = members.flat()

const fires = (fireRows.data ?? [])
  .map(f => ({
    ...f,
    distKm: Math.min(...allWaypoints.map(w => haversineKm(w.lat, w.lng, f.lat, f.lng))),
    bearing: bearingDeg(lat, lng, f.lat, f.lng),
  }))
  .filter(f => f.distKm <= corridorKm)
  .sort((a, b) => a.distKm - b.distKm)
```

### Cumulative fire pressure score

After filtering fires, compute a weighted score:

```ts
const firePressureScore = fires.reduce((sum, f) => {
  const ageHours = (anchorEndMs - new Date(f.acquired_at).getTime()) / 3_600_000
  const recencyWeight = Math.max(0, 1 - ageHours / 72)
  const transportWeight = 1 / (1 + f.distKm / corridorKm)
  const frpValue = f.frp ?? 10  // default 10 MW if null
  return sum + frpValue * recencyWeight * transportWeight
}, 0)

// Normalise to 0–100. Empirical ceiling: ~5000 weighted FRP units = severe event.
const firePressureNorm = Math.min(100, Math.round(firePressureScore / 50))
```

Label the score:
```ts
function firePressureLabel(score: number): string {
  if (score === 0) return 'None'
  if (score < 15) return 'Low'
  if (score < 40) return 'Moderate'
  if (score < 70) return 'High'
  return 'Very high'
}
```

### Urban/industrial/power plant accumulation

Replace the existing upwind-only urban source logic with footprint-based
accumulation. For each source in `urbanSources`:

```ts
const relevantSources = urbanSources
  .map(source => {
    const distKm = haversineKm(originWaypoint.lat, originWaypoint.lng, source.lat, source.lng)
    // Also check proximity to any waypoint along the center trajectory
    const minDistToPath = Math.min(
      ...centerTrajectory.map(w => haversineKm(w.lat, w.lng, source.lat, source.lng))
    )
    const effectiveDist = Math.min(distKm, minDistToPath)

    if (effectiveDist > 800) return null  // too far to be relevant

    const populationScore = source.population / (effectiveDist ** 2)
    const emissionScore = (source.emissionProxy * 10_000) / (effectiveDist ** 2)
    const influenceScore = populationScore + emissionScore

    if (influenceScore < MIN_INFLUENCE_SCORE) return null  // keep existing threshold

    // Upwind check against current day wind at nearest grid point
    const nearestWind = wind0.length ? nearestGridPoint(lng, lat, wind0) : null
    const bearing = bearingDeg(lat, lng, source.lat, source.lng)
    const isUpwind = nearestWind
      ? angleDiff(bearing, nearestWind.wind_direction_deg) <= UPWIND_TOLERANCE_DEG
      : false

    return { ...source, distKm: effectiveDist, influenceScore, isUpwind }
  })
  .filter(Boolean)
  .sort((a, b) => b!.influenceScore - a!.influenceScore)
  .slice(0, 8)
```

Keep existing `angleDiff` and `UPWIND_TOLERANCE_DEG` constants unchanged.

### CAMS sampling along trajectory

```ts
const camsData = camsRows.data ?? []

function sampleCams(
  lat: number, lng: number,
  data: { lat: number; lng: number; pm25: number }[]
): number | null {
  if (!data.length) return null
  let best = data[0], bestD = (best.lat - lat) ** 2 + (best.lng - lng) ** 2
  for (const p of data.slice(1)) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2
    if (d < bestD) { bestD = d; best = p }
  }
  return best.pm25
}

// Sample at origin + two intermediate points along center trajectory
const sampleIndices = [
  Math.floor(centerTrajectory.length * 0.33),
  Math.floor(centerTrajectory.length * 0.66),
  centerTrajectory.length - 1,
]
const camsSamples = sampleIndices
  .filter(i => i < centerTrajectory.length)
  .map(i => ({
    waypoint: centerTrajectory[i],
    pm25: sampleCams(centerTrajectory[i].lat, centerTrajectory[i].lng, camsData),
  }))
  .filter(s => s.pm25 !== null)
```

### Prompt rewrite

Keep all existing helper functions: `pm25Cat`, `computeTrend`, `compassFromDeg`,
outlier detection logic, `peerStr`, `outlierNote`, `dailyLines`. They are still
used.

Replace the prompt template with the following. Do not change what goes into
`peerStr`, `outlierNote`, or `dailyLines` — only the wind/fire/trajectory
sections change.

```ts
// Wind summary — 3 days, nearest grid point to station
const windSummary = [d0, d1, d2].map(date => {
  const grid = windGridsByDate.get(date)!
  if (!grid.length) return `  ${date}: no data`
  const nearest = nearestGridPoint(lng, lat, grid)
  return `  ${date}: from ${compassFromDeg(nearest.wind_direction_deg)} ` +
         `at ${nearest.wind_speed_kmh.toFixed(1)} km/h`
}).join('\n')

// Trajectory summary
const trajectoryStr = centerTrajectory.length < 2
  ? 'Insufficient wind data — trajectory unavailable'
  : [
      `Traced ${(centerTrajectory.length - 1) * 6}h back using 5-member ensemble`,
      `Origin region: ${originWaypoint.lat.toFixed(2)}°N, ${originWaypoint.lng.toFixed(2)}°E (${originWaypoint.date})`,
      `Corridor width: ${corridorKm.toFixed(0)} km (based on mean wind ${meanWindSpeedKmh.toFixed(1)} km/h)`,
      `Path (station → origin): ` + centerTrajectory
        .filter((_, i) => i % 4 === 0 || i === centerTrajectory.length - 1)
        .map(w => `${w.lat.toFixed(1)}°N ${w.lng.toFixed(1)}°E`)
        .join(' ← '),
    ].join('\n')

// CAMS string
const camsStr = camsSamples.length
  ? camsSamples.map(s =>
      `  ${s.waypoint.lat.toFixed(1)}°N ${s.waypoint.lng.toFixed(1)}°E ` +
      `(${s.waypoint.date}): ${s.pm25!.toFixed(1)} µg/m³ (${pm25Cat(s.pm25!)})`
    ).join('\n')
  : '  No CAMS data along trajectory'

// Fire string
const fireStr = fires.length === 0
  ? '  No fires detected within transport corridor'
  : fires.slice(0, 20).map(f => {
      const ageH = Math.round((anchorEndMs - new Date(f.acquired_at).getTime()) / 3_600_000)
      return `  ${f.lat.toFixed(2)}°N ${f.lng.toFixed(2)}°E — ` +
             `${f.distKm.toFixed(0)} km from path — ` +
             `FRP ${(f.frp ?? 0).toFixed(0)} MW — ${ageH}h ago`
    }).join('\n')

// Urban sources string
const sourcesStr = relevantSources.length === 0
  ? '  None identified within footprint'
  : relevantSources.map(s => {
      const upwindTag = s.isUpwind ? ' [currently upwind]' : ''
      const detail = s.type === 'power_plant'
        ? `${s.emissionProxy} MW plant`
        : s.type === 'industrial'
        ? 'industrial zone'
        : `pop. ${(s.population / 1e6).toFixed(1)}M`
      return `  ${s.name}, ${s.country} — ${s.distKm.toFixed(0)} km — ${detail}${upwindTag}`
    }).join('\n')

const prompt = `You are explaining current air quality to a general audience in plain English.

STATION: ${stationName} (${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E)
CURRENT PM2.5: ${latestPm25.toFixed(1)} µg/m³ — ${pm25Cat(latestPm25)}
RECENT TREND: ${trend}

7-DAY DAILY AVERAGES
${dailyLines || '  No historical data'}

WIND (last 3 days, nearest grid point to station)
${windSummary}

3-DAY BACK-TRAJECTORY (5-member ensemble, surface-level approximation)
${trajectoryStr}
NOTE: Simplified 2D surface trajectory from daily wind snapshots. Treat origin
region as indicative, not precise. Wind direction changes over 3 days are
reflected in the path shape.

AIR QUALITY ALONG TRAJECTORY (CAMS model PM2.5)
${camsStr}

CUMULATIVE FIRE PRESSURE (fires within transport corridor, last 72 h)
Score: ${firePressureNorm}/100 — ${firePressureLabel(firePressureNorm)}
Total fires along path: ${fires.length}
${fireStr}

UPWIND EMISSION SOURCES (cities, industrial zones, power plants along trajectory)
${sourcesStr}

PEER STATIONS WITHIN 75 KM (last 3 h)
${peerStr}
${outlierNote ? `\n${outlierNote}` : ''}

CONTEXT: Peak dry season in mainland Southeast Asia. Agricultural burning in
Myanmar, Laos, and northern Thailand can transport smoke hundreds of kilometres
under stable, low-wind conditions. The back-trajectory above shows where this
air mass originated over the past 72 hours — cross-reference with fire pressure
and CAMS values along that path.

Write 1–3 short paragraphs in plain English. No markdown, no bullet points —
flowing prose only.
The reader already sees the station name, PM2.5 value, and AQI category —
do not repeat these verbatim.
Lead with what is most interesting: where the air came from and what drove it.
- Use the trajectory and CAMS values to reason about transport over time, not
  just current wind direction. If wind direction changed significantly over
  3 days, note what that means for the pollution origin.
- The cumulative fire pressure score summarises fire activity along the actual
  transport path — weight it accordingly.
- If power plants or industrial zones are along the trajectory, mention them
  only if fire pressure is low or moderate (they explain background pollution,
  not acute spikes).
- Compare against peer stations. If this station is a strong outlier, lead
  with that.
- ${latestPm25 > 35 ? 'Conditions are elevated — focus on what explains the reading.' : 'Explain why conditions are currently relatively good.'}
- Do not describe the week trend — the user already sees the 7-day chart.
- Do not speculate beyond what the data shows.
${isStrongOutlier || isElevatedOutlier ? '- Suggest the most likely explanations for the anomaly.' : ''}`
```

---

## Step 4 — CLAUDE.md update

Add a new section. Do not change any other section.

```markdown
## Back-trajectory ensemble (explain endpoint)

The `/api/explain` endpoint uses a 5-member backward trajectory ensemble to
identify the 72-hour transport footprint of air arriving at a station.

### How it works

- 5 trajectories are traced from the station position (center + 4 cardinal
  offsets of 0.4°) using daily wind grids stored in `weather_readings`.
- Each trajectory steps backward in 6-hour increments for up to 72 hours,
  using the nearest grid point's wind vector at each step.
- The ensemble footprint (bounding box of all waypoints + corridor padding)
  is used to query fires, CAMS PM2.5, and urban/industrial sources.
- A **cumulative fire pressure score** (0–100) weights fires by FRP, recency,
  and proximity to the trajectory path.

### Implementation

- Pure computation in `packages/backend/src/utils/trajectory.ts` — no I/O.
- Wind grids are fetched for 3 dates in parallel, Redis-first with Supabase
  fallback, and cached at `weather:{date}` for 24h.
- CAMS data uses the existing Redis cache key pattern.

### Wind direction convention

Wind direction follows meteorological convention: the value is the direction
the wind is coming FROM, not blowing toward.
- Wind direction = 270° → wind from West → air moves East
- A source is upwind if the bearing FROM the station TO the source aligns
  with the wind direction value.

### Urban sources and power plants

`packages/backend/src/data/urbanSources.ts` includes cities, industrial zones,
and power plants. Power plants use `emissionProxy` (MW capacity) for influence
scoring rather than population. Influence is computed relative to proximity
along the trajectory path, not just straight-line distance from the station.
```

---

## Step 5 — Tests

Add `packages/backend/src/utils/trajectory.test.ts`. Use Vitest. No mocking —
pure functions only.

Tests to cover:

1. **Single step, known wind** — wind from North at 100 km/h, 6h step → origin
   moves ~54 km south of station. Verify `originWaypoint` lat is lower.
2. **Trajectory stops when wind data missing** — if `windGridsByDate` only has
   `d0`, trajectory length ≤ 5 steps (only `d0` covers first 24h).
3. **Ensemble has 5 members** — `traceEnsemble` always returns
   `members.length === 5`.
4. **footprintBbox contains all waypoints** — for any ensemble result, every
   waypoint lat/lng is within the bbox (before corridor padding check).
5. **corridorKm clamp** — very low wind speed (1 km/h) → corridorKm === 75.
   Very high (200 km/h) → corridorKm === 400.
6. **offsetDate** — `offsetDate('2024-03-01', -1)` === `'2024-02-29'` (leap year).
7. **haversineKm** — known distance: Bangkok (13.75°N, 100.5°E) to Chiang Mai
   (18.79°N, 98.98°E) ≈ 590 km. Assert within 5% tolerance.
8. **bearingDeg** — due north returns 0. Due east returns 90.
9. **Wrap-around step** — wind from 350°, position near prime meridian, verify
   no coordinate overflow.

---

## Done when

- `pnpm typecheck` passes
- `pnpm --filter backend test` passes (all 9 trajectory tests)
- The `/api/explain` endpoint returns a response that includes fire pressure
  score, trajectory path, and CAMS samples in its Gemini prompt
- CLAUDE.md has the new trajectory section
- No other sections of CLAUDE.md were changed
