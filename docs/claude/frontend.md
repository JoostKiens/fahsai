# Frontend — layers, map, state

## Deck.gl layers

| Layer | Deck.gl type | Key props |
|---|---|---|
| PM2.5 heatmap | `BitmapLayer` + `MaskExtension` | CAMS grid, 0.4° cells, bilinearly interpolated onto 630×730 px canvas, clipped to land via `SolidPolygonLayer` mask (`sea-land-mask.json`) |
| PM2.5 stations | `ScatterplotLayer` | OpenAQ ground stations, colored by `aqiColor(d.value)`, 5px radius |
| Fire points | 3× `ScatterplotLayer` (additive blend) | Outer glow / mid halo / inner core rings; pixel radius scales with zoom (1–3 px base); intensity from `brightTi4`; low-confidence at 50% opacity |
| Wind particles | Animated `TripsLayer` (comet-tail fade, non-interleaved overlay) | 2400 base particles (up to 2800 at deep zoom), bilinear interpolation, TRAIL_LENGTH=20, rAF loop |
| Power plants | `IconLayer` | Canvas atlas (96×32 diamond icons), Coal/Gas/Oil fuel types, 24px fixed size, hover tooltip |

**Why `BitmapLayer` not `HeatmapLayer` for PM2.5:** `HeatmapLayer` normalizes weights relative
to the viewport — the minimum value always maps to the first color regardless of absolute µg/m³,
producing incorrect AQI colors. `BitmapLayer` paints each cell directly with EPA-threshold colors
and bilinearly interpolates between neighbors, giving smooth gradients while preserving absolute
color accuracy. Always filter data server-side; only send the selected date's grid.

**Fire point color:** `#f97316` (orange) — uniform for all detections. The FIRMS area API does
not return `country_id`, so per-country coloring is not available.

---

## AQI color scale

US EPA official thresholds. Values are raw **PM2.5 µg/m³**, not AQI index values.
Colors defined once in `packages/frontend/src/utils/aqiColors.ts`, shared by both
`BitmapLayer` and `ScatterplotLayer`.

Two color functions serve different purposes — use the right one:
- `pm25ToRgb(pm25)` — step function; snaps to the category color at each EPA breakpoint.
  Used by map layers (heatmap, station dots) where exact threshold colors matter.
- `pm25ToRgbLerped(pm25)` — linearly interpolates between adjacent category colors within
  each band. Used by `TimelineChart` so the gradient line transitions fluidly rather than
  jumping at breakpoints.

At exact EPA breakpoints (e.g. 12.0 µg/m³), the two functions differ: `pm25ToRgbLerped`
returns the **next** category's color (t=1 of the lower band, fully transitioned), while
`pm25ToRgb` returns the **current** category's color (boundary is inclusive in the step
function).

| Category | PM2.5 µg/m³ | Hex | RGB |
|---|---|---|---|
| Good | 0–12.0 | `#58c458` | `[88, 196, 88]` |
| Moderate | 12.1–35.4 | `#f0d232` | `[240, 210, 50]` |
| Unhealthy (sensitive) | 35.5–55.4 | `#ff7e00` | `[255, 126, 0]` |
| Unhealthy | 55.5–150.4 | `#ff0000` | `[255, 0, 0]` |
| Very unhealthy | 150.5–250.4 | `#8f3f97` | `[143, 63, 151]` |
| Hazardous | 250.5+ | `#7e0023` | `[126, 0, 35]` |

---

## Map configuration

- Default center: `[101.0, 15.5]` (Thailand center)
- Default zoom: `5.5`
- Mapbox style: dark custom style (`mapbox://styles/mapbox/dark-v11` as base)
- Bounding box for data: `[89, 1, 114, 30]` (west, south, east, north) — all layers and
  `DEFAULT_BBOX` align to this
- Countries to label: Thailand, Myanmar, Laos, Cambodia, Vietnam (contextual only)

---

## Zustand stores

```typescript
// layerStore.ts
type LayerId = 'aqGrid' | 'aqStations' | 'fires' | 'wind' | 'powerPlants';

interface LayerStore {
  layers: {
    aqGrid:      { visible: boolean; opacity: number };
    aqStations:  { visible: boolean; opacity: number };
    fires:       { visible: boolean; opacity: number };
    wind:        { visible: boolean; opacity: number };
    powerPlants: { visible: boolean; opacity: number }; // default off
  };
  toggleLayer: (id: LayerId) => void;
}

// timeStore.ts
interface TimeStore {
  selectedDate: string; // YYYY-MM-DD, default: today
  setDate: (date: string) => void;
}
```

---

## Persisted user settings

User-facing settings are stored in `packages/frontend/src/store/settingsStore.ts` using
Zustand's `persist` middleware. Written to `localStorage` under key `taqm:settings`;
rehydrated automatically on app load — no manual `useEffect` needed.

**To add a new setting:**
1. Add the field and setter to `SettingsStore` in `settingsStore.ts`.
2. Set the default in the `create(...)` initialiser.
3. Bump `version` in the `persist` config and add a `migrate` function.
4. Read it with `useSettingsStore((s) => s.myField)`.
5. Expose the control in the Settings modal inside `Header.tsx`.

**`settingsStore` vs `uiStore`:**
- `settingsStore` — preferences that survive a page reload (e.g. `scrubberDays`)
- `uiStore` — transient session state that resets on reload (e.g. modal open/closed,
  selected map point, playing state)

**Session scrubber expansion (`sessionScrubberDays`):**
`uiStore` holds a `sessionScrubberDays: number | null` field (never persisted). When the
app loads with a `?date=` URL param that falls outside the user's stored `scrubberDays`
window but within 90 days, `useLatestDate` sets `sessionScrubberDays = 90` so the
linked date is reachable. Dates beyond 90 days still clamp with a toast. The user's stored
preference is never modified. Use `useEffectiveScrubberDays()` (hook) or
`getEffectiveScrubberDays()` (non-hook) from `uiStore.ts` wherever the active window size
is needed — do not read `settingsStore.scrubberDays` directly in scrubber-related code.

**Schema version history:**
- `version: 1` — initial: `scrubberDays` (30 | 60 | 90 | 120)

---

## Station baseline (seasonal pattern)

The station InfoPanel shows a seasonal PM2.5 baseline when data is available:

- **Callout text** -- classifies the current reading vs historical norm ("Above normal for
  late April, typically 24--44 ug/m3"). Logic in `baseline.ts` (`classifyReading`,
  `dateToPeriodKey`). Only shown when the baseline has >= 30 data points
  (`BASELINE_DISPLAY_GATE`).
- **YearCurve** -- always-visible SVG chart (`YearCurve.tsx`) showing the p25--p75 band,
  color-graded median line (`pm25ToRgbLerped`), and a current-reading dot. Data fetched
  via `useStationBaseline` (staleTime: Infinity, ~365 rows, near-static).

---

## Fire filtering

The `confidence` field is the appropriate field for filtering out noise.
Filter to `confidence IN ('nominal', 'high')` by default in the UI, with an option to
include low-confidence detections.

---

## AppScrollArea gotcha

`AppScrollArea` (wrapping `@base-ui-components/react` ScrollArea) renders a
`ScrollArea.Content` div that expands to the intrinsic width of its children.
When used in absolute-positioned dropdowns or constrained containers, long text
causes horizontal overflow. Fix: add `w-0 min-w-full overflow-hidden` to the
content wrapper inside the scroll area, and `overflow-x-hidden` to the
`viewportClassName` prop.

---

## Future layers (not in initial scope)

- Burn scars — Sentinel-2 NDVI differencing via Copernicus
- Population density overlay — to show human exposure
- Land use / farmland classification — contextualizes agricultural burning
- Trajectory lines — animated paths from fire clusters to cities using wind vectors
  (the "causality" killer feature — build after core layers are stable)
- Year-over-year comparison — requires accumulating historical data from day one
