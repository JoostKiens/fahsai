# `/api/explain` — implementation reference

## AI Explanation Cache

Explain responses are cached in Redis with key `explain:v{EXPLAIN_CACHE_VERSION}:{stationId}:{date}:{lang}`.
**Whenever you change the prompt** (in `buildPrompt.ts` or `buildScientificContext.ts`), bump
`EXPLAIN_CACHE_VERSION` in `packages/backend/src/routes/explain.ts`. Old keys orphan and expire
naturally after 7 days. Caching is production-only — dev always generates fresh.

---

## Back-trajectory ensemble

The explain endpoint uses a 5-member backward trajectory ensemble to identify the 72-hour
transport footprint of air arriving at a station.

### How it works

- 5 trajectories are traced from the station position (center + 4 cardinal offsets of 0.4°)
  using daily wind grids stored in `weather_readings`.
- Each trajectory steps backward in 6-hour increments for up to 72 hours, using the nearest
  grid point's wind vector at each step.
- The ensemble footprint (bounding box of all waypoints + corridor padding) is used to query
  fires, CAMS PM2.5, and urban/industrial/power-plant sources.
- A **cumulative fire pressure score** (0–100) weights fires by FRP, recency, and proximity
  to the trajectory path.
- When a station is a **strong outlier** (≥2× or ≤0.4× peer median), the trajectory, CAMS,
  and fire sections are omitted — regional transport data is not relevant for hyperlocal anomalies.

### Implementation

- Pure trajectory computation in `packages/backend/src/utils/trajectory.ts` — no I/O.
- Wind grids fetched for 3 dates (`d0`, `d1`, `d2`) in parallel, Redis-first (`weather:{date}`,
  TTL 7d) with Supabase `weather_readings` fallback.
- `getWindGrid` returns `WeatherReading[]` (from `@thailand-aq/types`), which is a structural
  superset of `WindGridPoint` and includes `precipitation_sum` and `relative_humidity_2m`
  used for the `WEATHER CONTEXT` prompt section.
- CAMS data: Redis key `cams:pm25:{date}` (TTL 7d), fallback to `cams_grid`.
- Seasonal context string selected by month: peak burning (Feb–Apr), early/late dry (Oct–Jan),
  monsoon (May–Sep).

### Helper function signatures

`nearestGridPoint(lat, lng, grid)` — lat first, consistent with all other geo functions
(`haversineKm`, `bearingDeg`). Do not reverse the argument order.

---

## Persistent wind direction context

When `station_weather` shows wind from a consistent direction (all 5 days within ±45°
of the circular mean), a `PERSISTENT WIND DIRECTION` section is added to the prompt.
This surfaces sources that lie in that direction beyond the 66-hour trajectory window —
physically plausible contributors the trajectory doesn't capture.

**Computation:** circular mean of `wind_direction_deg` from `station_weather` for
`d0`–`d4`. Consistency check: every reading within ±45° of the mean. Requires ≥ 3
days of data.

**Source filter:** sources from `relevantSources` where `distKm > corridorKm` AND
bearing from station to source is within ±45° of `persistentWind.directionDeg`.

**In the prompt:** framed as background context with uncertainty, not as confirmed
cause. The model should reference these sources as places the air "may have passed
over" before the trajectory window, not as direct contributors to the current reading.

---

## Urban pollution sources

A static list of major cities and industrial areas in mainland Southeast Asia is maintained in
`packages/backend/src/data/urbanSources.ts`. Used by `/api/explain` to identify upwind urban
emission sources when building the Gemini prompt context. No API calls — static data at runtime.

**Influence score** = `population / distanceKm²` (or `emissionProxy`-based for power plants
and industrial zones). Sources below a minimum threshold (default 50) are excluded.

**Upwind detection**: a source is upwind if its minimum distance to any waypoint across all
5 ensemble trajectory members is within `corridorKm`. This replaces the earlier bearing-angle
check against today's wind snapshot — trajectory proximity is physically correct because it
asks whether the air mass actually passed near the source, not whether the source is in
today's wind direction.

Influence formula:

```
populationScore = source.population / effectiveDist²
emissionScore   = (source.emissionProxy × 10_000) / effectiveDist²
influenceScore  = populationScore + emissionScore
```

Influence is computed relative to proximity along the trajectory path (minimum distance to any
center-trajectory waypoint), not straight-line distance from the station.

Files:

- `packages/backend/src/data/urbanSources.ts` — static data array (do not sync from external source)
- `packages/backend/src/lib/geo.ts` — `haversineKm`, `bearingDeg`, `compassFromDeg`
- `packages/backend/src/lib/urbanSources.ts` — `getRelevantUrbanSources()` helper

---

## Editing the prompt

The prompt is shared, permanent surface area. Every instruction you add lives in every
future request and can silently contradict another instruction. Before changing it, work
through the principles below, then follow the loop. The goal is a prompt that stays small
and internally consistent as the case taxonomy grows.

### Principles (read before any prompt edit)

**1. Fix-precedence — change the prompt last.** When output is wrong, diagnose in this
order and apply the highest fix that resolves it:

| Symptom                                       | Fix location                                        |
| --------------------------------------------- | --------------------------------------------------- |
| Wrong case assigned                           | `classify.ts` (classifier)                          |
| Wrong information reaching the model          | `buildScientificContext.ts` (data / context)        |
| Case and data correct, model still misbehaves | `buildPrompt.ts` (prompt instruction) — last resort |

Prefer upstream fixes. Computed booleans and context suppression in code cannot contradict
each other the way two English sentences can. A prompt rule is permanent and global; a
`firesAreLocal` boolean or a dropped CAMS section is targeted and self-consistent. Reach
for `buildPrompt.ts` only when the case and data are both correct.

**2. Word budgets.** Universal instructions ≤ 150 words. Per-case section ≤ 100 words.
Positive instructions only — state what to do, not a growing list of don'ts. If a budget
is blown, something needs cutting or moving to code, not appending.

**3. One example per case.** `buildExampleBlock` returns **at most one** example, keyed on
the case (and in some cases additional conditions). The assembled prompt never carries more
than one. This is a guardrail, not an accident:

- _Bloat:_ adding fixtures never grows the per-request prompt.
- _Conflict:_ the included example always agrees with the active case instruction — a CLEAN
  example can never sit next to a FIRE_TRANSPORT rule. The example reinforces the case,
  never competes with it.

Keep it this way. Never include all goldens, and never key example selection on anything
`buildExampleBlock` does not already see. `buildExampleBlock` is the source of truth for
selection logic — do not duplicate its conditions elsewhere.

**4. Conflict audit — run before adding any instruction.**

1. Search the universal rules, the target case section, and the banned-language list for an
   instruction that already covers this. Edit that one instead of adding a new one.
2. Check a new banned word does not collide with required vocabulary.
3. Run `--prompts-only` for the affected case and re-read the _assembled_ prompt end to end,
   looking for two instructions that pull in opposite directions. Also check
   `buildScientificDataBlock` — the `trendSection` string and any other conditional text
   injected into `<scientific_data>` can carry imperative instructions that override universal
   and case rules. Include the data block in the conflict audit read.
4. If a rule only matters for one case, it goes in that case's section — never universal.
5. When the model consistently ignores a prohibition, generic phrasing is rarely the fix.
   Name the exact phrases it produces (`"confirming conditions are similar"`, `"this location
   benefits from the maritime air"`) — concrete examples in the rule suppress the specific
   pattern more reliably than an abstract restatement.

### Edit + eval loop

1. **Reproduce.** Identify the failing fixture, or add a new one capturing the real-world
   case. Its `case` field reflects what the case _will be_ after your fix, not what it is now.
2. **Diagnose** with the fix-precedence table. Apply the highest-up fix that resolves it.
3. **If touching the prompt,** run the conflict audit first. Prefer editing an existing
   instruction over adding one.
4. **Update or write the golden** for the fixture — the hand-written ideal output
   (see Goldens below).
5. **Wire the golden** as the case example if it is new.
6. **Bump `EXPLAIN_CACHE_VERSION`** whenever `buildPrompt.ts` or `buildScientificContext.ts`
   changes — see "AI Explanation Cache" above.
7. **Verify, in order:**

   ```bash
   pnpm --filter backend eval:explain -- --prompts-only   # assembled prompt looks right
   pnpm --filter backend eval:explain -- --no-stream      # output matches golden, no regressions
   pnpm typecheck && pnpm lint
   ```

Eval flags: `--fixture=NN` runs one fixture (saves quota), `--prompts-only` prints the prompt
without calling Gemini (free, fast), `--no-stream` returns a non-streaming response (cleaner
diffs). Free tier is 15 RPM; the runner waits 4,500 ms between fixtures, so a full run takes
~2 minutes.

### Goldens

Goldens live in `eval/golden/*.ts`, one per fixture, exporting a single string:

```ts
export const golden = `<one or more paragraphs of the ideal explanation>`;
```

The golden file is the **single source of truth**: the eval compares actual output against it,
_and_ the prompt imports it as the case example. They cannot drift because they are the same
string. Never copy golden prose anywhere else, including into this doc — for voice and
structure, read the real files in `golden/`; do not maintain a second example here.

Wiring a new golden as an example:

```ts
import { golden as goldenMyCase } from '../scripts/eval/my-fixture.js'

const EXAMPLE_MY_CASE = `<example>\n${goldenMyCase}\n</example>`

// buildExampleBlock returns at most one, keyed on case (+ conditions):
case 'MY_CASE': return EXAMPLE_MY_CASE

```

A golden is hand-written, never model-generated, and must satisfy the output rules:

- Cause-first: answer "what is causing this reading?" before anything else.
- No CAMS µg/m³ values — describe origin character in plain language ("clean marine air",
  "smoke from Myanmar").
- No fire-pressure score numbers — fire counts and geography only.
- No specific time windows — "recently", "over the past few days", "for weeks"; never
  "72 hours" or "14 days".
- No em-dashes.
- Integers for PM2.5, always with µg/m³.
- Fires "have been detected" with a time window — never present continuous.
- Peers only when they add causal information — omit otherwise; never name individual
  stations when count > 3.
- Strictly data-grounded — never cite a number that is not in the fixture's input.
