# Rollbar Observability

Two separate Rollbar projects: **backend** and **frontend**. Both are production-only —
the SDKs are no-ops when the respective env var is absent (i.e. in local dev).

Free tier limit: **5,000 occurrences/month** across both projects combined.

---

## What is tracked

### Backend

| Event                             | Level     | Where                               |
| --------------------------------- | --------- | ----------------------------------- |
| Unhandled route errors (5xx)      | `error`   | `setErrorHandler` in `server.ts`    |
| Gemini API rate limit hits        | `warning` | `routes/explain.ts`                 |
| Ingestion job failures            | `error`   | `scripts/ingest-*.ts` catch blocks  |
| Process-level uncaught exceptions | `error`   | `captureUncaught: true` in SDK init |

### Frontend

| Event                        | Level   | Where                               |
| ---------------------------- | ------- | ----------------------------------- |
| React render errors          | `error` | `ErrorBoundary` components          |
| Unhandled JS exceptions      | `error` | `captureUncaught: true` in SDK init |
| Unhandled promise rejections | `error` | `captureUnhandledRejections: true`  |

## What is NOT tracked

- **Some cron scripts don't call `reportError`.** Only `ingest-fires`, `ingest-station-readings`,
  `ingest-cams` (+ `-today-fallback`) and `ingest-weather` (+ `-today-fallback`) report to Rollbar.
  `ingest-stations`, `ingest-station-fire-pressure`, `ingest-station-baseline`, `prune` and
  `ingest-power-plants` only `console.error` and exit 1, so a failure there is visible in Railway
  logs but not in Rollbar.

- **User 429s** (our `/api/explain` rate limit hits) — expected behavior, covered by
  existing Redis counters (`ratelimit:explain`).
- **4xx route errors** — client errors, not our bugs. The `setErrorHandler` skips
  anything with `statusCode < 500`.
- **Anything in development** — both SDKs initialize only when their token env var
  is set **and** `NODE_ENV` / `MODE` is `production`. Local dev always falls through
  to console/Pino logs.
- **"Failed to initialize WebGL."** — near-universal on headless/bot traffic
  (no GPU), not real users. Filtered client-side via `checkIgnore` in
  `packages/frontend/src/lib/rollbar.ts` before the payload is sent.
- **"Failed to fetch dynamically imported module" from a crawler user agent**
  (`/bot|crawl|spider/i`, e.g. Googlebot) — crawlers abort subresource fetches for lazy
  chunks like MapView. Filtered in the same `checkIgnore`; the same error from real
  users is still reported, as is any other error from a crawler.

---

## Adding Rollbar calls in new code

**Backend** — import from `lib/rollbar.ts`:

```ts
import { reportError, reportWarning } from '../lib/rollbar.js';

reportError(err); // sends at 'error' level
reportError(err, { context: 'extra' }); // with extra metadata
reportWarning('message', { key: 'val' }); // sends at 'warning' level
```

Both functions are silent no-ops when not in production or when `ROLLBAR_TOKEN` is unset.

**Frontend** — React render errors are caught automatically by the `ErrorBoundary`
wrapper. For imperative errors outside React rendering, use:

```ts
import { rollbar } from '../lib/rollbar';
rollbar?.error(err);
```

The browser SDK is configured to route through `POST /api/rollbar` on the backend
(see `routes/rollbar-proxy.ts`) rather than posting directly to `api.rollbar.com`.
This avoids ad-blocker / privacy-extension interference (e.g. Ghostery). The
backend relay forwards the payload unchanged and passes Rollbar's response back.

---

## Error boundaries

Four `ErrorBoundary` wrappers guard independently-useful UI regions (`App.tsx`,
`UIOverlay.tsx`). Each fallback keeps the region's footprint so the layout does not shift, and
shows a short message:

| Component   | Fallback behaviour                                                       |
| ----------- | ------------------------------------------------------------------------ |
| `MapView`   | Full-size dark div with "Map unavailable" (inside a `Suspense`)          |
| `Sidebar`   | `w-65` aside (desktop only) with "Controls unavailable"                  |
| `InfoPanel` | Absolute-positioned `w-[260px]` card (desktop only), "Panel unavailable" |
| `Scrubber`  | Bar with `md:h-13` and "Timeline unavailable"                            |

The reusable `<ErrorBoundary name="..." fallback={...}>` lives at
`packages/frontend/src/components/ErrorBoundary.tsx` (flat, no `ui/` subdirectory — see the
single-file component convention in `docs/claude/conventions.md`). It is a plain React class
component that calls `rollbar.error(error, { component: name, componentStack })` in
`componentDidCatch`, and falls back to `console.error` in dev (when `rollbar` is null).

---

## Env vars

| Package             | Var                  | Where set                     |
| ------------------- | -------------------- | ----------------------------- |
| `packages/backend`  | `ROLLBAR_TOKEN`      | Railway environment variables |
| `packages/frontend` | `VITE_ROLLBAR_TOKEN` | Vercel environment variables  |

Both env vars are documented in their respective `.env.example` files.
The backend token is a **server-side access token** (secret).
The frontend token is a **client-side access token** (safe to ship in the browser bundle).
