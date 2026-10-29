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
- 2026-10-24 has 556 fires, mostly north of 14°N, and a usable PM2.5 contrast: 0.4–83 µg/m³
  (median 8.6), highest in the north-west corner of the grid (≈27°N 95°E).

The snapshots are the raw API responses, minified (`cams` 98 KB, `fires` 72 KB, `wind` 320 KB)
under `src/components/Map/story-harness/fixtures/2026-10-24/`. Stories run them through the
app's own parsers (`parseCamsGridResponse`). Committing them matters more than planned: the
data will be pruned from production too.

- **What made output non-deterministic, and the fix for each:**
  - *Mapbox basemap* (token, network tiles): not used. `DeckHarness` runs a standalone `Deck`
    on a plain `bg-zinc-900` background.
  - *Viewport / device pixel ratio*: fixed 800×600 canvas, fixed `viewState`
    (101.4°E 15.4°N, zoom 4), `useDevicePixels: 1`.
  - *Live data*: committed fixtures passed as props; no TanStack Query or fetch in the stories.
  - *Readback*: `deviceProps.webgl.preserveDrawingBuffer: true`. Already the deck.gl v9 default,
    set explicitly because the probes depend on it.
  - CAMS and fires needed nothing else. Two loads of each story in fresh headless Chromium
    pages give **0 differing pixels** (CAMS 167,014 drawn px; fires 4,073). WebGL renderer:
    `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device …))`, i.e. software rendering.
  - *Not output, but test flakiness*: the first cold `test:storybook` run failed because Vite
    discovered deck.gl mid-run and reloaded. Fixed with `optimizeDeps.include` in the
    storybook Vitest project.
- **Render-ready approach used:** `DeckHarness` takes `layers: Layer[] | null` (`null` = story
  data not ready, e.g. the CAMS worker hasn't returned its bitmap). On every `onAfterRender`
  it sets `data-render-ready` to whether layers are set and every layer's `isLoaded` is true;
  any `layers` change resets it to `false`. `layerManager` is protected in deck.gl 9.4, so it
  checks the layer instances it passed in (deck.gl keeps those instances after diffing).
  `waitForRenderReady(canvasElement)` polls for it (10 s default) and returns the `Deck` for
  probes and picking. On timeout it says why: no harness, `layers` still `null`, which layers
  are loading, or "loaded but no frame since". Both canvas stories await it in `play`.
- **Note for Phase 5:** the PM2.5 bitmap is drawn at `HEATMAP_ALPHA` 55/255 over a dark
  background, so ramp colours come out dark and close together. Probes must compute the
  expected colour after blending, not compare against raw ramp hex values.

## Phase 4: the gap

| Planted bug | Interaction test result | Expected |
|---|---|---|
| lat/lng swap | | fail |
| inverted ramp | | fail |
| empty fire data | | fail |

## Phase 5: checks

- Pixel probe tolerance needed:
- Which check caught which bug:
- Headless WebGL issues:

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
