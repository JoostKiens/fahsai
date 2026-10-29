# Experiment log — Storybook + canvas verification

Can an AI agent verify its own change to a canvas-rendered (Deck.gl/WebGL) component? DOM-based
interaction and accessibility tests can't see inside `<canvas>`, so a self-check can pass while the
map is visibly wrong. This log records the setup, the gap, and the checks that close it, including
the parts that didn't work.

**Versions:** Storybook 10.6.5 · deck.gl 9.4 · React 19.3 · Vite 8.3 · Vitest 5.0.3 ·
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

- What made output non-deterministic, and the fix for each:
- Render-ready approach used:

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
