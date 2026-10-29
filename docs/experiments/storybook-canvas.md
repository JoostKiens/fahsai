# Experiment log — Storybook + canvas verification

Can an AI agent verify its own change to a canvas-rendered (Deck.gl/WebGL) component? DOM-based
interaction and accessibility tests can't see inside `<canvas>`, so a self-check can pass while the
map is visibly wrong. This log records the setup, the gap, and the checks that close it, including
the parts that didn't work.

**Versions:** Storybook 10.6.5 · deck.gl 9.4.0 (luma.gl 9.4.2) · React 19.3 · Vite 8.3 · Vitest 5.0.3 ·
Playwright 1.64.1 (Chromium for Testing 156)

## Phase 1: agent-driven setup

Command: `npx create-storybook@10.6.5 --agent --features docs test ai --package-manager pnpm
--builder vite --type react --no-dev --disable-telemetry`, then `pnpm exec storybook skills setup`.
It detected that it was running in Claude Code ("Proceeding with agentic installation flow").

- **What it detected:** pnpm, TypeScript, `react-vite` framework (type was passed explicitly).
- **What it generated:** `.storybook/main.ts` + `preview.tsx`; addons Chromatic, Vitest, Docs,
  MCP; a second Vitest project (`storybook`, Playwright Chromium, headless); `vitest.shims.d.ts`;
  `storybook` / `build-storybook` scripts; the ESLint Storybook plugin; `.gitignore` entries;
  the example `Button`/`Header`/`Page` stories in `src/stories/`. It installed Playwright browsers.
  `skills setup` then prints a ~300-line agent prompt: add MSW, mockdate, up to 10 colocated
  stories tagged `ai-generated`/`needs-work`, exactly one `CssCheck` story, verify with vitest.
- **What it got wrong or missed:**
  - Installed `eslint-plugin-storybook` in `packages/frontend`, but wired it into the **root**
    `eslint.config.js`, so `pnpm lint` crashed (`ERR_MODULE_NOT_FOUND`). Moved to root devDeps.
  - Reformatted the whole `eslint.config.js` (double quotes, collapsed array, import above
    `// @ts-check`). Reverted, then the plugin was appended in house style.
  - Pinned `@chromatic-com/storybook` and `playwright` to `latest`. Removed Chromatic (an external
    service nobody asked for) and the unused `@vitest/coverage-v8`; pinned Playwright.
  - Did not enable `features.componentsManifest`, although the `ai` feature was selected. Added
    by hand; without it `docs-list` has nothing to list.
  - Vitest project: the generated config dropped `@tailwindcss/vite`. `vitest.config.ts` replaces
    `vite.config.ts` for Vitest, so stories ran unstyled in the browser tests (interactive
    Storybook was fine because it reads `vite.config.ts`). The mandatory `CssCheck` story caught
    it on the first run: background was `rgba(0, 0, 0, 0)` instead of `bg-teal-600`. Good
    evidence that its own "prove the CSS loaded" rule earns its place.
  - `pnpm test` would now have run both projects (Chromium too). Scoped `test` to
    `--project unit` and added `test:storybook`.
  - **Nothing Deck.gl- or Mapbox-specific.** The setup prompt is DOM-only: MSW for data,
    `getComputedStyle` for styling, and "don't build large story-specific harnesses — fix
    preview instead". A WebGL map needs exactly such a harness (no basemap, fixed viewport,
    readable drawing buffer, ready signal). Followed in reduced form: real CSS in the preview,
    one DOM story (`Toggle`) with the `CssCheck`, no MSW (fixtures go in via props or a
    pre-filled query cache in Phase 2).
  - Not added to the preview yet: `src/i18n.ts` (it calls `window.location.replace` when the
    stored language is Thai, which would navigate the Storybook iframe away).
- **MCP:** `POST http://localhost:6006/mcp` serves `docs-list`, `docs-show`, `docs-show-story`,
  `get-storybook-story-instructions`, `stories-changed`, `stories-find-by-component`,
  `stories-preview`, `test-run`. `docs-list` returned `Toggle (components-sidebar-toggle)`. The
  server's own instructions tell agents to run **`test-run` — never a package.json test script**
  after any visual change. That is exactly the self-check this experiment questions.

## Phase 2–3: determinism

**Fixture day: 2026-10-24, not 2026-04-17.** The production API returns 404 for all three layers
on 17 April: `prune` keeps 140 days (`RETENTION_DAYS`), so nothing before ~11 June 2026 exists.
Scanned every day still stored (fires via `/api/fires/range`):

- 2026-09-15 had the most fires (1,941), but 1,867 sit in one 2° cell offshore of southern
  Vietnam (≈8°N 106°E), likely gas flares. A misleading picture of "fire activity"; rejected.
- 2026-10-24 has 556 fires, mostly north of 14°N, and a usable PM2.5 contrast: 0.4–105.5 µg/m³
  (median 8.6). The maximum (105.5 at 1°N 108.2°E) is over sea, where the land mask hides it;
  on land the highest values are in the north-west corner of the grid (83.5 at ≈27.4°N 95°E).

The snapshots are the raw API responses, minified (`cams` 98 KB, `fires` 72 KB; `wind` 320 KB
arrives with the wind story) under `src/components/Map/story-harness/fixtures/2026-10-24/`. Stories run them through the
app's own parsers (`parseCamsGridResponse`). Committing them matters more than planned: the
data will be pruned from production too.

- **What made output non-deterministic, and the fix for each:**
  - *Mapbox basemap* (token, network tiles): not used. `DeckHarness` runs a standalone `Deck`
    with the app's page background (zinc-900) drawn into the canvas as a first, non-pickable
    `SolidPolygonLayer`, so pixel readback matches what a viewer sees. (A CSS background, the
    first version, leaves the canvas itself transparent. A view `clearColor`, the second, broke
    the land mask: the MaskExtension's mask pass clears to it as well, so every pixel counted as
    land and the PM2.5 grid covered the sea. Still 0 pixels different between loads, i.e.
    deterministic and wrong. Caught only by looking at a screenshot.)
  - *Viewport / device pixel ratio*: fixed 800×600 canvas, fixed `viewState`
    (101.4°E 15.93°N, zoom 3.7: the whole CAMS grid, 466×567 px, centred on its Mercator
    midpoint; zoom 4 cut off 630 of 4,599 cells and 23 fires), `useDevicePixels: 1`.
  - *Live data*: committed fixtures passed as props; no TanStack Query or fetch in the stories.
  - *Readback*: `deviceProps.webgl.preserveDrawingBuffer: true`. Already the deck.gl v9 default,
    set explicitly because the probes depend on it.
  - CAMS and fires needed nothing else. Two loads of each story in fresh headless Chromium
    pages give **0 differing pixels** (non-background pixels: CAMS 137,169; fires 4,650). WebGL
    renderer:
    `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))`, i.e. software rendering.
  - *Wind particles* (`Math.random` spawning, `requestAnimationFrame` timing, Mapbox inputs):
    the only production change. `useWindParticles` takes an optional last argument
    `{ random, freezeAtFrame }`; with neither set, the app runs exactly as before
    (`Math.random`, endless rAF loop). `random` is captured once at mount and threaded down to
    `resetParticle`, the only place randomness enters. `freezeAtFrame` runs that many fixed
    16.67 ms steps synchronously, renders once and starts no rAF loop. The two Mapbox
    parameters were narrowed to the members the hook uses (`setProps`; `getBounds`,
    `getContainer().clientWidth`, `on`/`off`), so the story passes a stand-in map that reports
    the harness's fixed view, and a layer target that feeds `DeckHarness`. The `MapView` call
    site is unchanged and still typechecks with the real `MapboxOverlay`/`mapboxgl.Map`.
    Seed: a 10-line mulberry32 in `story-harness/seeded-random.ts`. Two loads of the wind
    story (seed 1, frame 120): **0 differing pixels** (4,633 non-background px). Unit tests mount the
    real hook: same seed gives identical trail positions, a different seed differs, and frozen
    mode never calls `requestAnimationFrame`. After review, the loop body is split into
    `step(dt)` and `draw()`: frozen mode steps N times (counted in hook state, so an effect
    re-run from a new overlay/map object doesn't step past N), then draws once, also at frame 0.
    Both options are read once at mount. Same frame as before the split (4,633 px, 0 different).
    A StrictMode-based test for the re-run case passed on the *old* code too: StrictMode also
    re-runs the effect that rebuilds the particles, so it never exposed the bug; the test now
    re-renders with a new overlay object instead, and fails on the old code. The live app still animates (two screenshots
    500 ms apart differ; no console errors).
  - *Not output, but test flakiness*: the first cold `test:storybook` run failed because Vite
    discovered deck.gl mid-run and reloaded. Fixed with `optimizeDeps.include` in the
    storybook Vitest project.
- **Render-ready approach used:** `DeckHarness` takes `layers: Layer[] | null` (`null` = story
  data not ready, e.g. the CAMS worker hasn't returned its bitmap). On every `onAfterRender`
  it sets `data-render-ready` to whether layers are set and every layer's `isLoaded` is true;
  any `layers` change resets it to `false` and forces a `deck.redraw()`, so a frame (and a
  chance to become ready again) always follows. `layerManager` is protected in deck.gl 9.4, so it
  checks the layer instances it passed in (deck.gl keeps those instances after diffing).
  `waitForRenderReady(canvasElement)` polls for it (10 s default) and returns the `Deck` for
  probes and picking. On timeout it says why: no harness, `layers` still `null`, which layers
  are loading, or "loaded but no frame since". Both canvas stories await it in `play`.
- **Two harness bugs the first pixel probes exposed (Phase 5).** Both passed every test until
  something read the canvas, because "ready" only ever meant "a frame rendered":
  - The background layer was one module-level instance shared by every `Deck`. Vitest renders
    all stories in one page, so the second `Deck` hit a deck.gl assertion and drew no background;
    the canvas stayed transparent. Now a fresh layer per update, as deck.gl expects.
  - A story that draws at mount (wind) could render, and signal ready, into the canvas's default
    300×150 buffer before deck.gl resized it to 800×600. Fresh-page screenshots never hit this;
    the in-page Vitest run did. The `<canvas>` now has its size from the start, and readiness
    also requires the drawing buffer to be 800×600 (the timeout message says so if not).
- **Cleanup:** on unmount the harness calls `deck.finalize()` and then `device.loseDevice()`.
  Neither `finalize()` nor luma.gl 9.4's `device.destroy()` releases the WebGL context (by
  design, for React strict mode); without `loseDevice()` every story mount leaks a context
  (checked: `isContextLost()` stays `false` after unmount with `destroy()`, `true` with
  `loseDevice()`).
- **Note for Phase 5:** the PM2.5 bitmap is drawn at `HEATMAP_ALPHA` 55/255 over the zinc-900
  background layer, so ramp colours come out dark and close together. Probes must compute the
  expected colour blended over (24, 24, 27), not compare against raw ramp hex values.

## Phase 4: the gap

**The ordinary test.** `Map/Layer toggles` (`LayerToggles.stories.tsx`) wires `LayerGroups` (the
real sidebar) to the PM2.5 grid and fire layers the way `MapView` does: store visibility and
opacity pick the layers, fires don't wait for the CAMS bitmap, and layers are memoised. Its play
function is the kind of check an agent typically writes. It checks the legend (`µg/m³` and the
six ranges `0–9` … `225+`), waits for `data-render-ready`, and checks that `fire-glow` is in the
Deck's layer list. Then it clicks the Fires switch and checks `aria-checked`, the store's
`fires.visible`, and that `fire-glow` has left the layer list (not just that a frame rendered:
the ready flag can still be from before the click). It looks at nothing inside the canvas. Supporting changes: English i18next set up in
`.storybook/preview.tsx` (not `src/i18n.ts`, which can redirect the page), and `i18next` and
`react-i18next` added to `optimizeDeps.include`. Their first cold run failed with the same
mid-run reload as deck.gl did in Phase 2.

**The bugs**, as one-line patches in `docs/experiments/storybook-canvas/bugs/` (apply with
`git apply <patch>`, undo with `git apply -R <patch>`; never committed as code):

- `cams-latlng-swap.patch`: the CAMS worker computes each point's grid row from its longitude
  and its column from its latitude (the classic copy-paste swap). The grid comes out transposed
  and cropped: the northern band is empty and the pattern is mirrored. Plausible at a glance.
- `inverted-ramp.patch`: `pm25ToRgba` returns the colour of the mirrored AQI category, so clean
  air is drawn hazardous and vice versa. Almost the whole map turns purple and dark red. The
  legend stays correct, because it reads `AQI_CATEGORIES` directly.
- `empty-fires.patch`: `createFiresLayer` passes `data: []`. The fires story draws **0**
  non-background pixels (4,650 without the bug).

**Result: every story test passes with every bug.** All 8 (the 4 Toggle stories, the 3 layer
stories that only await readiness, and the layer-toggle story) stay green, and typecheck stays
clean. Baseline: also 8/8.

| Planted bug | Interaction test result | Other story tests | Unit tests | Expected |
|---|---|---|---|---|
| lat/lng swap | **pass** | 7/7 pass | 134/134 pass | fail |
| inverted ramp | **pass** | 7/7 pass | **1 fails** | fail |
| empty fire data | **pass** | 7/7 pass | 134/134 pass | fail |

The one catch is not from Storybook. An existing unit test (`aqiColors.test.ts`, "appends alpha
to the rgb tuple") pins `pm25ToRgba`'s output, so the inverted ramp fails it. That works only
because the bug was planted in a function with its own unit test. Put the same inversion in the
worker or the bitmap layer and nothing would notice. `test-run` (the Storybook MCP tool agents
are told to use instead of package.json scripts) runs only the story tests, so an agent following
that instruction would see all green for all three bugs.

## Phase 5: checks

**What was added** (`src/components/Map/story-harness/probes.ts`, ~140 lines, no dependencies):

- `expectPixelNear({ deck, lngLat, expected, tolerance, label })`: projects a longitude/latitude
  with the Deck's own viewport, reads that canvas pixel back (copy to a 2D canvas, then
  `getImageData`), and compares per channel. `heatmapColorOnBackground(rgb)` gives the expected
  colour: an AQI category colour blended at the bitmap's 55/255 alpha over the zinc-900
  background. The category colours are written out in the story, not imported. A first
  version derived them with the app's own `pm25ToRgb`, so an inverted ramp *there* would have
  changed both sides and passed (found in review; inverting `pm25ToRgb` now fails the story). The PM2.5 story probes one Unhealthy cell (62.4 µg/m³, 23°N 89.4°E) and one Good
  cell (7 µg/m³, 19.8°N 101.4°E). Both sit inside blocks of one AQI category, chosen from the
  fixture by script, and their values are read from the fixture at test time.
- `expectPicked({ deck, bbox, layerId, min, label })`: `deck.pickObjects` over the box's screen
  rectangle; counts distinct objects. The fires story requires 75% of the fixture's fires in
  97–106°E 14–23°N (57 → at least 43), and fails outright if the fixture has none there
  (otherwise the minimum would be 0 and the check would pass on nothing). Overlapping glows hide some from picking: 48 of 57 are
  found here, 383 of 556 over the whole grid.
- `expectDrawnPixels({ deck, bbox, min, label })`: counts pixels that differ from the background.
  The wind story requires at least 2,000 in the grid (4,632 drawn at seed 1, frame 120), and
  only at those default controls. It says nothing about where trails are or what colour.
  Boxes are clipped to the canvas (off-canvas pixels read as transparent, which would count as
  drawn), and a box that misses the canvas gets a readable error instead of `IndexSizeError`.
- **Visual expectations in docs.** Each story's component has a JSDoc paragraph saying what correct
  output looks like (extent, colours, where the highs and the dense fire bands are) and what the
  play function checks. *This only reached agents after moving each story's component into its
  own file* (`story-harness/Pm25Grid.tsx`, `Fires.tsx`, `WindParticles.tsx`, `LayerToggles.tsx`).
  The components manifest reported `No component file found for the "Pm25Grid" component` for
  components defined inside the story file, and `docs-show` then returned only the story list.
  `parameters.docs.description.component` didn't reach `docs-show` either. After the move,
  `docs-show` returns the full paragraph plus a usage snippet. The descriptions were checked
  against screenshots, and two were wrong on the first try (the wind loop's latitude, a missed
  fire band).
- **Visual snapshots** would sit on top of this as the regression layer (e.g. a stored PNG per
  story compared at a small threshold). Not built. Probes say *what* is wrong in words an agent
  can act on; a snapshot diff only says *that* something changed.

- **Pixel probe tolerance needed:** 8 per channel. On the clean build the Good cell matched
  the computed blend exactly and the Unhealthy cell was off by 4 in one channel (`#4a1715` vs
  `#4a1315`, bitmap texture filtering). After blending, the closest pair of AQI categories
  (Moderate vs Unhealthy for sensitive groups) is 18 apart, so a wrong category can't pass.
- **Which check caught which bug** (each patch applied on its own; all 8 story tests otherwise):

| Planted bug | Caught by | Failure message |
|---|---|---|
| lat/lng swap | PM2.5 story, pixel probe | `PM2.5 cell (62.4 µg/m³): expected ~#4a1315 at (178, 161) [89.4°E 23°N], got #4a2a15 (max channel difference 23, tolerance 8)` |
| inverted ramp | PM2.5 story, pixel probe | same message: Unhealthy (red) became Unhealthy for sensitive groups (orange) |
| empty fire data | Fires story, picking | `Fires (57 in the fixture for this box): expected at least 43 'fire-glow' objects picked in [97°E 14°N – 106°E 23°N], got 0` |

  The two CAMS bugs give the *same* message by coincidence. Under the swap that pixel shows
  the value from 1.4°N 111°E (36.1 µg/m³), which is also in the orange category. The DOM-only
  `Layer toggles` story still passes all three, as intended: it's the Phase 4 control.
- **What the probes did *not* catch: a real app bug.** A code review of this PR noticed that
  `createPM25BitmapLayer` never set `_imageCoordinateSystem`. The worker paints the bitmap
  with rows evenly spaced in latitude, but deck.gl stretched it evenly in Web Mercator, so the
  live heatmap was drawn up to ~0.8° off (worst around 15–20°N). Measured by reading every
  land cell centre against its own category colour: **83.2%** matched (1,931 / 2,320; 75% in
  the 15°N band), **100%** with `COORDINATE_SYSTEM.LNGLAT`. Fixed in a separate app PR (#65).
  The two-cell probe passed throughout, because the cells were chosen inside blocks of one
  category. The very choice that makes a probe robust makes it blind to a sub-cell shift.
  **Follow-up:** `expectCellColors` now sweeps every CAMS cell centre in the PM2.5 story,
  against a category table written out in the story. Every drawn cell must show its own
  category's colour (0 mismatches allowed), and the number of drawn cells must be within 2% of
  the land cells counted from the land-mask geometry (2,347; 2,320 are drawn, the rest sit right
  on a coastline). A first version allowed 1% mismatches against a hard-coded 2,320 instead; a
  review showed that hid real bugs. It passed a `<=` → `<` boundary flip (only 15 land cells sit
  exactly on a breakpoint), and an unclipped mask that colours the sea (skipped background
  cells, no upper bound). Both now fail, as does #65's fix undone (`1931 cells match their
  colour, 389 don't`). The failure message gives matched, mismatched and background counts plus
  the first three mismatches.
- **Headless WebGL issues:** colours were stable (SwiftShader; 0 pixels different between
  loads). The real problems were in the harness, and only showed up once something read
  pixels: a shared background layer instance that failed in the second `Deck` of a page, and a
  ready signal that fired while the canvas was still 300×150 (see Phase 2–3; fixed in the
  harness PR). Picking works under SwiftShader.

## Phase 6: agent run

- Task given:
- Without probes:
- With probes:
- Surprises:

## Open questions / what didn't work

- **Story tests and the Storybook UI can disagree.** `Toggle` is controlled, so the story needs
  to flip `checked` itself. With Storybook's documented `useArgs` pattern:
  - in the **Storybook UI**, `updateArgs` re-renders the story, which re-runs the loader that
    restores all `fn()` mocks, so `expect(onChange).toHaveBeenCalledOnce()` fails with 0 calls;
  - under the **Vitest addon** (what `test-run` uses), `updateArgs` never re-renders, so the call
    is counted but the switch never flips.
  The same play function failed in one place and passed in the other, for opposite reasons. Fixed
  by keeping `checked` in React state in a small story wrapper (no args round-trip): identical in
  both, so the play asserts the call and the flip again. Two lessons for agents: `test-run`
  passing does not mean the story works in the UI, and play functions also run in the UI, so a
  play that clicks changes what a reader sees.
