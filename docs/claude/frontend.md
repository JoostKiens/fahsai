# Frontend — layers, map, state

## Deck.gl layers

All layer files live in `packages/frontend/src/components/Map/` (there is no separate
`layers/` directory).

| Layer          | Deck.gl type                                                                                                    | Key props                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PM2.5 heatmap  | `BitmapLayer` + `MaskExtension`                                                                                 | CAMS grid, 0.4° cells, bilinearly interpolated onto 630×730 px canvas, clipped to land via `SolidPolygonLayer` mask (`sea-land-mask.json`)                                                                                                                                                                                                                                                                                                                                                                             |
| PM2.5 stations | `IconLayer` + `ScatterplotLayer` + `TextLayer` (`PM25Layer.ts`)                                                 | OpenAQ ground stations, Supercluster-grouped; single stations render as 15px-radius dots colored by `pm25ToRgba(d.value)`; clusters render as flat-top hexagon icons (canvas atlas, "H3 style", two-line label: mean value + ×count) -- the source itself has inconsistent naming for this shape (`clusterDiamonds` variable, "Cluster pentagons" comment); it is a hexagon                                                                                                                                            |
| Fire points    | `FireGlowLayer` (`ScatterplotLayer` subclass, fragment-shader radial gradient, additive blend, `FiresLayer.ts`) | Solid `#fff5cc` core fading into a soft `#ffaa00`→`#ff4400` glow, drawn on a disc of 4× the base radius (also the click target); tuning constants at the top of the file; pixel radius scales smoothly with zoom (`ZOOM_CURVE`: ×2 per 1.5 levels, clamped 1–6 px, computed once in GLSL from `project.scale` and patched into the radius, so glow and `FireSelectionRingLayer` track zoom gestures live); intensity multiplier from `frp` (fire radiative power), not a brightness field; low-confidence at 50% alpha |
| Wind particles | Animated `TripsLayer` (comet-tail fade, non-interleaved overlay, `useWindParticles.ts`)                         | 2400 base particles (up to 2800 at deep zoom), bilinear interpolation, rAF loop; trails trimmed by age (TRAIL_LENGTH=14 × 16.67 ms), so length is refresh-rate independent                                                                                                                                                                                                                                                                                                                                             |
| Power plants   | `IconLayer` (`PowerPlantsLayer.ts`)                                                                             | Canvas atlas (128×32, four 32×32 diamond icons), Coal/Gas/Oil/Diesel fuel types, zoom-dependent size (18/22/26/32px via `iconSizeForZoom`), hover tooltip                                                                                                                                                                                                                                                                                                                                                              |

**Why `BitmapLayer` not `HeatmapLayer` for PM2.5:** without an explicit `colorDomain`,
`HeatmapLayer` derives its color scale from the max weight in the current viewport, so the same
µg/m³ gets a different color depending on what's in view. Pinning `colorDomain` fixes that, but
`colorRange` is still spread evenly across the domain, while the EPA breakpoints (9, 35.4, 55.4,
125.4, 225.4 µg/m³) are uneven. It's also a point-density layer: each point's weight is spread
over `radiusPixels` in screen space and summed or averaged, so the result depends on zoom and
grid spacing rather than the modelled concentration. `BitmapLayer` paints each cell directly with
EPA-threshold colors and bilinearly interpolates between neighbors, giving smooth gradients while
preserving absolute color accuracy. Always filter data server-side; only send the selected date's grid.

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

At exact EPA breakpoints (e.g. 9.0 µg/m³), the two functions differ: `pm25ToRgbLerped`
returns the **next** category's color (t=1 of the lower band, fully transitioned), while
`pm25ToRgb` returns the **current** category's color (boundary is inclusive in the step
function).

| Category              | PM2.5 µg/m³ | Hex       | RGB              |
| --------------------- | ----------- | --------- | ---------------- |
| Good                  | 0–9.0       | `#58c458` | `[88, 196, 88]`  |
| Moderate              | 9.1–35.4    | `#f0d232` | `[240, 210, 50]` |
| Unhealthy (sensitive) | 35.5–55.4   | `#ff7e00` | `[255, 126, 0]`  |
| Unhealthy             | 55.5–125.4  | `#ff0000` | `[255, 0, 0]`    |
| Very unhealthy        | 125.5–225.4 | `#8f3f97` | `[143, 63, 151]` |
| Hazardous             | 225.5+      | `#7e0023` | `[126, 0, 35]`   |

---

## Map configuration

- Default center: `[101.0, 15.5]` (Thailand center); mobile override `CENTER_MOBILE = [102.0, 13.5]`
- Default zoom: `5.5`; mobile override `ZOOM_MOBILE = 4.7`
- Mapbox style: custom Mapbox Studio dark style (`mapbox://styles/joostkiens/cm30pk39v00ah01qz4n2i1ssu`),
  not a stock `mapbox/dark-v11` style
- Bounding box for data: `[89, 1, 114, 30]` (west, south, east, north) — all layers and
  `DEFAULT_BBOX` align to this
- Countries to label: Thailand, Myanmar, Laos, Cambodia, Vietnam (contextual only)

---

## Page structure (Astro islands)

`src/pages/index.astro` and `src/pages/th/index.astro` are prerendered and use `layouts/AppShell.astro`,
which lays out four islands (`src/islands/`):

| Island     | Rendered                     | Root               | Holds                                                                                           |
| ---------- | ---------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `Header`   | server, then hydrated        | `ServerIslandRoot` | brand, search, language pill, menu, About and Settings dialogs                                  |
| `Sidebar`  | server, then hydrated        | `ServerIslandRoot` | layer switches and legends                                                                      |
| `Map`      | browser only (`client:only`) | `IslandRoot`       | map, overlay, URL and date sync, data toasts, analytics; the `#intro` text is its fallback slot |
| `Scrubber` | browser only (`client:only`) | `IslandRoot`       | time scrubber                                                                                   |

- The islands share the Zustand stores below and one `QueryClient` (`lib/queryClient.ts`). Each is
  its own React root, so a render error takes down one island, not the page.
- A server-rendered island can only import code that works without a browser. Read the query string
  through `currentSearch()` (returns `''` without a window), not `window.location`.
  `src/ssr.test.tsx` renders them in a Node environment.
- Language comes from the page: `ServerIslandRoot` takes a `lang` prop, `IslandRoot` loads
  `@/i18n`, which detects it (see `docs/adr/0002-i18n-thai-language.md`).
- Keep a `client:only` island in its own module; see `docs/adr/0007-astro-frontend.md`.

---

## Zustand stores

```typescript
// layerStore.ts
type LayerId = 'aqGrid' | 'aqStations' | 'fires' | 'wind' | 'powerPlants';

interface LayerStore {
  layers: {
    aqGrid: { visible: boolean; opacity: number };
    aqStations: { visible: boolean; opacity: number };
    fires: { visible: boolean; opacity: number };
    wind: { visible: boolean; opacity: number };
    powerPlants: { visible: boolean; opacity: number }; // default off
  };
  toggleLayer: (id: LayerId) => void;
}

// timeStore.ts
interface TimeStore {
  latestDate: string; // valid YYYY-MM-DD, starts as yesterday ICT, updated by useLatestDate
  latestDateResolved: boolean; // false until useLatestDate returns the real value
  selectedDate: string; // YYYY-MM-DD -- default is yesterday (ICT), not today; a valid
  // ?date= URL param (within MAX_DAYS = 120 days) overrides the default
  setLatestDate: (date: string) => void;
  setDate: (date: string) => void;
}
// selectIsSettled(s) -- true once latestDateResolved && selectedDate <= latestDate;
// gate toasts/other "settled" UI on this selector.
```

---

## URL state

`useUrlSync` mirrors map center/zoom, selected date and the selected point into the query string
(`lat`, `lng`, `zoom`, `date`, `sel`; debounced 500 ms via `history.replaceState`, and only once
`latestDateResolved`). Language lives in the path (`/th/` vs `/`), not a query param. On boot,
`useSelectionHydration` resolves `?sel=` into a full `SelectedPoint` once the station/fire/
power-plant queries have data; any explicit user selection cancels it.

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
window but within `MAX_DAYS` (120, exported from `uiStore.ts`), `useLatestDate` sets
`sessionScrubberDays = MAX_DAYS` so the linked date is reachable. Dates beyond that still
clamp with a toast. The user's stored
preference is never modified. Use `useEffectiveScrubberDays()` (hook) or
`getEffectiveScrubberDays()` (non-hook) from `uiStore.ts` wherever the active window size
is needed — do not read `settingsStore.scrubberDays` directly in scrubber-related code.

**Schema version history:**

- `version: 1` — initial: `scrubberDays` (30 | 60 | 90 | 120)
- `version: 2` — added `language: Language | null` (migrate: sets `language: null` for pre-v2 state)
- `version: 3` — `scrubberDays: 120` is valid again; migrate restores it instead of clamping to
  90 for any pre-v3 state that still had 120 stored

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

There is no confidence-based filtering, server- or client-side -- all fires for the selected
date/bbox are always fetched and rendered. `FiresLayer.ts` renders `confidence === 'low'`
points at half alpha instead of excluding them (see the Deck.gl layers table above).

---

## AppScrollArea gotcha

`AppScrollArea` (wrapping `@base-ui/react` ScrollArea) renders a
`ScrollArea.Content` div that expands to the intrinsic width of its children.
When used in absolute-positioned dropdowns or constrained containers, long text
causes horizontal overflow. Fix: add `w-0 min-w-full overflow-hidden` to the
content wrapper inside the scroll area, and `overflow-x-hidden` to the
`viewportClassName` prop.

---

## BottomSheet (mobile panels)

`BottomSheet` is the mobile (`md:hidden`) shell for the layer menu and the info panel. It is a
`role="dialog"` and needs an `ariaLabel`; reuse the desktop counterpart's label
(`sidebar.ariaLabel`, `infoPanel.ariaLabel`). `showBackdrop` decides whether it is modal:

- **With backdrop (layer menu): modal.** `aria-modal`, and every other child of `<body>` is
  `inert` while it is open, so focus can't leave it.
- **Without backdrop (info panel): non-modal.** The map behind stays usable.

Either way, opening moves focus into the sheet and closing returns it to the opener. Anything
portalled to `<body>` while a modal sheet is open (and not inside it) is not made inert.
Focus and `inert` only apply below the md breakpoint (`useIsMobile`). Above it the sheet is
hidden but can stay open (its state lives in the caller), and an inert page would have no
visible way out.

---

## Data fetching

Every request to the API goes through `src/lib/api.ts`:

- `apiUrl(path)` puts a route under `/api/v1`. `/api/rollbar` is the only unversioned call and does
  not go through it.
- `fetchApiData` (routes that answer `{ data }`) and `fetchJson` throw an `HttpError` carrying the
  status on any non-OK response. Hooks and prefetches share one fetcher per route (`fetchFires`,
  `fetchWind`, ...), so their error handling cannot drift apart.
- A 404 means an empty day only when its body has `code: 'no_data'` (`isNoData`); any other 404 is a
  failure. Only date-keyed routes use `fetchApiData`; a route that answers an empty result with a
  200 uses `fetchJson`.
- The app retries only network errors and 5xx (`shouldRetry`), never a 4xx.
- A failed query shows one toast (`handleQueryError`); an API error (`HttpError`) also goes to
  Rollbar, once per message. A dropped connection is not reported. A query
  nobody is looking at, such as the prefetch of a neighbouring day, sets
  `meta: BACKGROUND_QUERY_META` to stay quiet.
- Storybook's msw handlers must match `*/api/v1/...`: `*/api/...` does not match the versioned URLs.

## Future layers (not in initial scope)

- Burn scars — Sentinel-2 NDVI differencing via Copernicus
- Population density overlay — to show human exposure
- Land use / farmland classification — contextualizes agricultural burning
- Trajectory lines — animated paths from fire clusters to cities using wind vectors
  (the "causality" killer feature — build after core layers are stable)
- Year-over-year comparison — requires accumulating historical data from day one
