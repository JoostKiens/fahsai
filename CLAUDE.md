# Fahsai — CLAUDE.md

## Project overview

A web-based interactive map visualizing the causes of air pollution in Thailand and
surrounding countries (Myanmar, Laos, Cambodia). The goal is civic and educational:
to make it visually undeniable that fires in neighboring countries — combined with
wind patterns — are a primary cause of Thailand's seasonal PM2.5 spikes, countering
the narrative of blame-shifting between countries and agricultural sectors.

This is a personal, non-commercial project by a single developer. Prioritize
simplicity and correctness over premature optimization.

---

## Reference docs

- Data sources, ingestion, API routes: `docs/claude/architecture.md`
- Database schema: `docs/claude/database.md`
- Frontend layers, AQI scale, map config: `docs/claude/frontend.md`
- Shared TypeScript types: `docs/claude/types.md`
- Conventions, gotchas, wind direction: `docs/claude/conventions.md`
- `/api/explain` implementation (cache, back-trajectory, urban sources): `docs/claude/explain.md`
- Rollbar error tracking (what's captured, env vars, ErrorBoundary): `docs/claude/rollbar.md`

---

## Conventions

Before writing or reviewing any JavaScript or TypeScript code, invoke the `frontend-conventions` skill.

For **new files**, the convention skills above take precedence over existing
patterns in the codebase.

For **existing files**, match the style of the file you are editing unless
the task is explicitly a refactor. If you notice a convention violation while
working in a file, mention it rather than fixing it silently.

---

## Monorepo structure

```
/
├── CLAUDE.md
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json        # shared tsconfig
├── packages/
│   ├── types/                # shared TypeScript interfaces (no runtime deps)
│   │   └── src/
│   │       ├── fire.ts
│   │       ├── aqi.ts
│   │       ├── wind.ts
│   │       ├── power-plant.ts
│   │       └── index.ts
│   ├── backend/              # Node + Fastify API + Railway cron scripts
│   │   └── src/
│   │       ├── server.ts     # Fastify entry point
│   │       ├── routes/       # API route handlers
│   │       ├── jobs/         # ingestion scripts (run via Railway cron)
│   │       ├── db/           # Supabase client + query helpers
│   │       ├── cache/        # Upstash Redis client + helpers
│   │       └── lib/          # shared utilities (geo transforms, etc.)
│   └── frontend/             # React + Vite SPA
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── components/
│           │   ├── Map/      # Mapbox + Deck.gl map shell
│           │   ├── Sidebar/  # layer toggles, opacity, legend
│           │   ├── TimeSlider/
│           │   └── StatsPanel/
│           ├── layers/       # one file per Deck.gl layer
│           │   ├── FiresLayer.ts
│           │   ├── PM25Layer.tsx
│           │   ├── WindLayer.ts
│           │   └── PowerPlantsLayer.ts
│           ├── hooks/        # TanStack Query hooks, one per data type
│           │   ├── useFires.ts
│           │   ├── useStationReadings.ts
│           │   ├── useWind.ts
│           │   ├── useWindParticles.ts
│           │   ├── usePowerPlants.ts
│           │   └── useStationHistory.ts
│           └── store/        # Zustand stores
│               ├── layerStore.ts
│               └── timeStore.ts
```

---

## Tech stack

### Frontend

- React 18 + TypeScript, Vite
- Mapbox GL JS (base map, dark style)
- Deck.gl (data layers)
- Zustand (UI state), TanStack Query v5 (data fetching), Turf.js (geo utils)

### Backend

- Node.js 20+ + TypeScript, Fastify
- `@fastify/cors` — registered before all routes; allows
  `https://fahsai.fyi` in all environments plus
  `http://localhost:5173` when `NODE_ENV !== 'production'`; methods: GET, POST only
- `trustProxy: true` set on the Fastify instance — required for correct `request.ip`
  behind the Railway proxy (reads `x-forwarded-for` instead of the raw socket IP)
- `POST /api/explain` has per-IP rate limiting via `@upstash/ratelimit` (sliding
  window, 10 req/hour, prefix `ratelimit:explain`); Upstash errors fail open so
  legitimate users are never blocked by infrastructure issues
- Upstash Redis (hot cache), Supabase (Postgres)

### Shared

- `packages/types` — TypeScript interfaces shared between frontend and backend
- pnpm workspaces, ESLint + shared tsconfig

### Deployment

- Frontend → Vercel (Hobby), Backend + cron → Railway (Hobby ~$5/mo)
- Database → Supabase (free tier), Redis → Upstash (free tier)

---

## Environment variables

### Backend (`packages/backend/.env`)

```
NODE_ENV=development
PORT=3001
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=    # use service role for backend writes
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
FIRMS_MAP_KEY=
OPENAQ_API_KEY=
GEMINI_API_KEY=
```

### Frontend (`packages/frontend/.env`)

```
VITE_API_BASE_URL=http://localhost:3001
VITE_MAPBOX_TOKEN=            # public token, pk.* prefix
```

Never commit `.env` files. Provide `.env.example` files with all keys listed but no values.
Never expose `SUPABASE_SERVICE_ROLE_KEY` or `FIRMS_MAP_KEY` to the frontend.

**Claude must never read any `.env` file in this project, except `.env.example` files.**

---

## Development workflow

```bash
pnpm install                                      # install all deps from repo root
pnpm dev                                          # start frontend + backend concurrently
pnpm --filter backend dev                         # backend only
pnpm --filter frontend dev                        # frontend only

# One-off ingestion (manual testing)
pnpm --filter backend run ingest:firms
pnpm --filter backend run ingest:station-readings
pnpm --filter backend run ingest:wind
pnpm --filter backend run ingest:cams YYYY-MM-DD   # CAMS PM2.5 grid
pnpm --filter backend run ingest:power-plants     # WRI power plants (pass CSV path as optional arg)

# One-time backfill after deploying migration 018_station_weather.sql
pnpm --filter backend run backfill:station-weather

# Fire pressure scores (75 km radius, 14-day window — its own Railway cron, station-fire-pressure.json, 30 4 * * *)
pnpm --filter backend run backfill:station-fire-pressure -- --start=YYYY-MM-DD --end=YYYY-MM-DD

# Seasonal PM2.5 baseline (median, p25, p75 per calendar day per station from OpenAQ S3 archive).
# Full re-backfill is manual; day-to-day upkeep runs automatically via its own Railway cron
# (station-baseline.json, 40 4 * * *), which fills in any station_baseline rows that don't
# exist yet (e.g. a newer station whose curve stops mid-year) using only that year's
# station_readings data -- no S3 access. Rows the last full backfill already computed (with a
# proper multi-year pool) are left untouched, not recomputed from a single year's data.
pnpm --filter backend run backfill:station-baseline -- --start=YYYY --end=YYYY

pnpm typecheck                                    # type-check all packages
pnpm lint                                         # lint all packages
```

---

## Code style

- Prettier for formatting, ESLint for code quality
- Config in `prettier.config.js` at repo root
- Single quotes, semicolons, trailing commas, 100 char print width
- Run `pnpm format` before committing
- Never use loose equality (`==` / `!=`). Always use strict equality (`===` / `!==`).
  For null+undefined checks use `=== null || === undefined` or TypeScript narrowing.
- `// eslint-disable-line react-hooks/exhaustive-deps` may be used sparingly. It must
  always be preceded by a comment on the same line or the line above explaining exactly
  which deps are omitted and why (e.g. stable module-level refs, intentional stale
  closure). Prefer structural fixes (derive values from deps, refs) over suppressions.

## Dev tooling

- ESLint 9 flat config (`eslint.config.js` at root)
  - `@typescript-eslint` recommended-type-checked for all packages
  - `eslint-plugin-react-hooks` for `packages/frontend` only
  - `eslint-config-prettier` applied last
- Prettier: single quotes, semicolons, trailing commas, 100 char width
- Husky + lint-staged: formats and lints staged files on pre-commit
- Commitlint: conventional commits enforced on commit-msg hook
- Vitest: `packages/backend` (node env) and `packages/frontend` (jsdom env)
- `.vscode/settings.json`: formatOnSave, eslint fixOnSave, rulers at 100

## Internationalisation (i18n)

Translation files live at `packages/frontend/src/locales/en.json` and `th.json`.

**Whenever you add or rename a string in either file, update both files.** The keys in
`en.json` and `th.json` must always be identical — `src/test/i18n-parity.test.ts` enforces
this and will fail CI if they diverge.

---

## License and attribution requirements

The following attributions must appear in the UI footer or an "About" panel:

- Fire data: "Fire data courtesy NASA FIRMS (firms.modaps.eosdis.nasa.gov)"
- AQI data: "Air quality data from OpenAQ (openaq.org)"
- Weather/AQ model: `<a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>` (CC BY 4.0)
- Power plant data: "Power plant data from WRI Global Power Plant Database (resourcewatch.org)" (CC BY 4.0)
- Map tiles: Mapbox attribution (rendered automatically by Mapbox GL JS — do not hide it)

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## 5. Verification & Testing

Always run `tsc --noEmit` (typecheck) and the linter after making code edits, and fix any errors before considering the task done.

## 6. Working with Specs

When a spec or assets are referenced, read the local spec/asset files first — do not fetch private GitHub URLs or convert assets that are already provided ready-to-use.

## 7. Data Ingest & Backfill

When querying or backfilling Supabase/Postgres data, set explicit time-bound upper limits and add retry handling (e.g., pRetry) to long-running backfill scripts. See `docs/claude/conventions.md` for the Supabase 1000-row pagination gotcha.

## 8. Debugging Approach

Do not make overconfident claims about root causes (e.g., calling something a 'core bug' or assuming data storage/refetch behavior) without verifying against the actual code or data first.

## 9. General Principles

Prefer the simplest solution that meets the stated requirements; do not over-engineer (e.g., gated multi-platform CI deployments) or alter text/behavior the user did not ask to change.

Before implementing, give me a numbered plan broken into independently-committable steps so we can stop cleanly between them.

Before changing the schema or ingest logic, ask me any clarifying questions about replace-vs-append semantics and downstream query impact.

When deduplicating scattered call sites into a shared helper (e.g. a pagination or retry
utility), audit each site's original error-handling contract (throw vs. silent-degrade vs.
custom error response) and any per-item bookkeeping on error paths before assuming the
shared helper's default behavior is a safe drop-in. Silently turning a silent-degrade path
into an uncaught throw, or dropping a counter increment on an error branch, are regressions
that type-checking and existing tests won't catch.
