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

# Fire pressure scores (14-day rolling window, 120-day retention)
pnpm --filter backend run ingest:fire-pressure [YYYY-MM-DD]   # defaults to yesterday
pnpm --filter backend run backfill:fire-pressure -- --start=YYYY-MM-DD --end=YYYY-MM-DD

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
