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
- Use cases (researchers, journalists, policymakers, NGOs): `docs/use-cases.md`

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
├── .railway/railway.ts       # Railway infrastructure-as-code (services + cron schedules)
├── scripts/                  # Python helper for the sea/land mask (generate-land-mask.py)
├── docs/                     # claude/ reference docs, adr/ decision records, use-cases.md
├── packages/
│   ├── types/                # shared TypeScript interfaces (no runtime deps)
│   │   └── src/
│   │       ├── fire.ts
│   │       ├── aq.ts
│   │       ├── weather.ts
│   │       ├── station.ts
│   │       ├── baseline.ts
│   │       ├── power-plant.ts
│   │       └── index.ts
│   ├── consts/                # shared runtime constants (no deps)
│   │   └── src/
│   │       ├── times.ts
│   │       ├── aqGrid.ts
│   │       └── index.ts
│   ├── backend/              # Node + Fastify API + Railway cron scripts
│   │   └── src/
│   │       ├── server.ts     # Fastify entry point
│   │       ├── routes/       # API route handlers
│   │       ├── jobs/         # ingestion/backfill core logic, called by scripts/
│   │       ├── scripts/      # CLI entrypoints — the pnpm ingest:*/backfill:*/eval:*
│   │       │                 # commands below, and Railway cron targets, run these
│   │       ├── db/           # Supabase client + query helpers
│   │       ├── cache/        # Upstash Redis client + rate limiters
│   │       ├── lib/          # /api/explain scientific-context logic, pino logger, Rollbar
│   │       ├── utils/        # geo, date, backfill (pagination/concurrency), classification,
│   │       │                 # per-provider API clients (openaq, openmeteo, firms), CORS helpers
│   │       └── data/         # static reference data (urban sources, geo regions)
│   └── frontend/             # React + Vite SPA
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── i18n.ts
│           ├── components/
│           │   ├── Map/      # Mapbox + Deck.gl map shell + one file per Deck.gl
│           │   │             # layer (FiresLayer.ts, PM25Layer.ts, PowerPlantsLayer.ts)
│           │   ├── Sidebar/  # layer toggles, opacity, legend
│           │   ├── Scrubber/ # time scrubber
│           │   ├── InfoPanel/
│           │   ├── Header/
│           │   ├── ExplainButton/
│           │   └── ErrorBoundary.tsx, BottomSheet.tsx, etc. (flat top-level components)
│           ├── hooks/        # TanStack Query data hooks (useFires, useStationReadings,
│           │                 # useCamsGrid, useLatestDate, usePowerPlants, useWind, ...)
│           │                 # plus URL/selection sync (useUrlSync, useSelectionHydration)
│           ├── store/        # Zustand stores
│           │   ├── layerStore.ts
│           │   ├── timeStore.ts
│           │   ├── settingsStore.ts
│           │   └── uiStore.ts
│           ├── lib/          # rollbar.ts
│           ├── utils/        # aqiColors, bbox, deck-overlay, etc.
│           ├── test/         # vitest setup, i18n-parity test
│           └── locales/      # en.json, th.json
```

---

## Tech stack

### Frontend

- React 19 + TypeScript, Vite
- Mapbox GL JS (base map, custom Mapbox Studio style)
- Deck.gl (data layers), Supercluster (station clustering)
- Zustand (UI state), TanStack Query v5 (data fetching), motion (animation)
- Tailwind CSS (styling), i18next/react-i18next (Thai/English), Fuse.js (station/place
  search), sonner (toasts)
- Rollbar (error tracking), Vercel Analytics + Speed Insights

### Backend

- Node.js 24 + TypeScript, Fastify
- `@fastify/cors` — registered before all routes; allows
  `https://fahsai.fyi` in all environments plus
  `http://localhost:5173` when `NODE_ENV !== 'production'`; methods: GET, POST only
- `@fastify/compress` — response compression
- `trustProxy: true` set on the Fastify instance — required for correct `request.ip`
  behind the Railway proxy (reads `x-forwarded-for` instead of the raw socket IP)
- Per-IP rate limiting via `@upstash/ratelimit`, two limiters in `cache/ratelimit.ts`:
  `explainRatelimit` for `POST /api/explain` (sliding window, 5 req/hour, prefix
  `ratelimit:explain`) and `explainContextRatelimit` for `GET /api/explain/context`
  (sliding window, 20 req/min, prefix `ratelimit:explain-context`); Upstash errors
  fail open so legitimate users are never blocked by infrastructure issues
- Upstash Redis (hot cache), Supabase (Postgres)
- `@google/generative-ai` (Gemini, powers `/api/explain`), `p-retry` (backfill/ingest
  retries), `pino` (structured logging), Rollbar (error tracking), `csv-parse`
  (power plant CSV ingest), `@turf/boolean-point-in-polygon` (geo classification)

### Shared

- `packages/types` — TypeScript interfaces shared between frontend and backend
- `packages/consts` — shared runtime constants (no deps)
- pnpm workspaces, ESLint + shared tsconfig

### Deployment

- Frontend → Vercel (Hobby), Backend + cron → Railway (Hobby ~$5/mo)
- Database → Supabase (free tier), Redis → Upstash (free tier)

---

## Environment variables

### Backend (`packages/backend/.env.local`)

```
NODE_ENV=development
PORT=3001
LOG_LEVEL=info
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=    # use service role for backend writes
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
FIRMS_MAP_KEY=
OPENAQ_API_KEY=
GEMINI_API_KEY=
CDS_API_KEY=                  # Copernicus CDS, ERA5 backfill only
ROLLBAR_TOKEN=
```

### Frontend (`packages/frontend/.env.local`)

```
VITE_API_BASE_URL=http://localhost:3001
VITE_MAPBOX_TOKEN=            # public token, pk.* prefix
VITE_ROLLBAR_TOKEN=
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
pnpm --filter backend run ingest:fires
pnpm --filter backend run ingest:stations         # OpenAQ station metadata sync
pnpm --filter backend run ingest:station-readings
pnpm --filter backend run ingest:weather
pnpm --filter backend run ingest:cams YYYY-MM-DD   # CAMS PM2.5 grid
pnpm --filter backend run ingest:power-plants     # WRI power plants (pass CSV path as optional arg)
pnpm --filter backend run ingest:station-fire-pressure
pnpm --filter backend run ingest:station-baseline
pnpm --filter backend run prune                   # retention cleanup

# One-time backfill after deploying migration 018_station_weather.sql
pnpm --filter backend run backfill:station-weather

# Other one-off backfills / diagnostics (see each script's header comment for flags)
pnpm --filter backend run backfill:station-readings [startDate] [endDate]  # OpenAQ S3 archive
pnpm --filter backend run backfill:weather -- --start=YYYY-MM-DD --end=YYYY-MM-DD  # ERA5 (needs CDS_API_KEY)
pnpm --filter backend run backfill:cams-summary -- --start=YYYY-MM-DD --end=YYYY-MM-DD
pnpm --filter backend run backfill:fires-noaa21 <path-to-json>
pnpm --filter backend run check-data-ranges
pnpm --filter backend run check-date-gaps

# Fire pressure scores (75 km radius, 14-day window — its own Railway cron, ingest-station-fire-pressure, 30 4 * * *)
pnpm --filter backend run backfill:station-fire-pressure -- --start=YYYY-MM-DD --end=YYYY-MM-DD

# Seasonal PM2.5 baseline (median, p25, p75 per calendar day per station from OpenAQ S3 archive).
# Full re-backfill is manual; day-to-day upkeep runs automatically via its own Railway cron
# (ingest-station-baseline, 40 4 * * *), which fills in any station_baseline rows that don't
# exist yet (e.g. a newer station whose curve stops mid-year) using only that year's
# station_readings data -- no S3 access. Rows the last full backfill already computed (with a
# proper multi-year pool) are left untouched, not recomputed from a single year's data.
pnpm --filter backend run backfill:station-baseline -- --start=YYYY --end=YYYY

pnpm typecheck                                    # type-check all packages
pnpm lint                                         # lint all packages
pnpm test                                         # run all package test suites
pnpm format                                       # prettier --write across all packages

# Golden-set eval for /api/explain prompt/output quality (English + Thai)
pnpm --filter backend run eval:explain            # also eval:explain:th, eval:explain:prompts
```

Most `ingest:*`/`backfill:*` commands above also have a `railway:*`-prefixed twin
(e.g. `railway:ingest:fires`) — those are what Railway cron actually invokes; see
`docs/claude/architecture.md` for the schedule of each cron job.

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

- ESLint 10 flat config (`eslint.config.js` at root)
  - `@typescript-eslint` recommended-type-checked for all packages
  - `eslint-plugin-react-hooks` for `packages/frontend` only
  - `eslint-config-prettier` applied last
- Prettier: single quotes, semicolons, trailing commas, 100 char width
- Husky + lint-staged: formats and lints staged files on pre-commit; pre-push runs
  `pnpm typecheck` and `pnpm test`
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

Behavioral guidelines for coding work. Merge with project-specific instructions as needed.

## 1. Think Before Coding

State assumptions, present competing interpretations instead of picking silently, and ask when something is unclear. Say so when a simpler approach exists.

## 2. Simplicity First

Write the minimum code that solves the problem: no unrequested features, no abstractions for single-use code, no handling for impossible scenarios.

## 3. Surgical Changes

Every changed line should trace to the request. Match the surrounding style, mention unrelated dead code instead of deleting it, and remove only the orphans your own change created.

## 4. Goal-Driven Execution

Turn tasks into verifiable goals (a failing test that then passes, tests green before and after a refactor). For multi-step work, state a brief plan with a check per step.

## 5. Verification & Testing

Always run `tsc --noEmit` (typecheck) and the linter after making code edits, and fix any errors before considering the task done.

## 6. Working with Specs

When a spec or assets are referenced, read the local spec/asset files first — do not fetch private GitHub URLs or convert assets that are already provided ready-to-use.

## 7. Data Ingest & Backfill

When querying or backfilling Supabase/Postgres data, set explicit time-bound upper limits and add retry handling (e.g., pRetry) to long-running backfill scripts. See `docs/claude/conventions.md` for the Supabase 1000-row pagination gotcha.

**This applies to every Supabase query that could plausibly return more than 1000 rows, not
just scripts named `backfill-*`.** A daily incremental/ingest script querying `stations`,
`station_readings`, or any other growing table needs the same `fetchAllPages`/`.range()`
treatment — one such script shipped without it and silently truncated in production before
being caught in review.

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
