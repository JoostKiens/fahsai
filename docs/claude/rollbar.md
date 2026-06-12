# Rollbar Observability

Two separate Rollbar projects: **backend** and **frontend**. Both are production-only —
the SDKs are no-ops when the respective env var is absent (i.e. in local dev).

Free tier limit: **5,000 occurrences/month** across both projects combined.

---

## What is tracked

### Backend
| Event | Level | Where |
|---|---|---|
| Unhandled route errors (5xx) | `error` | `setErrorHandler` in `server.ts` |
| Gemini API rate limit hits | `warning` | `routes/explain.ts` |
| Ingestion job failures | `error` | `scripts/ingest-*.ts` catch blocks |
| Process-level uncaught exceptions | `error` | `captureUncaught: true` in SDK init |

### Frontend
| Event | Level | Where |
|---|---|---|
| React render errors | `error` | `ErrorBoundary` components |
| Unhandled JS exceptions | `error` | `captureUncaught: true` in SDK init |
| Unhandled promise rejections | `error` | `captureUnhandledRejections: true` |

## What is NOT tracked

- **User 429s** (our `/api/explain` rate limit hits) — expected behavior, covered by
  existing Redis counters (`ratelimit:explain`).
- **4xx route errors** — client errors, not our bugs. The `setErrorHandler` skips
  anything with `statusCode < 500`.
- **Anything in development** — both SDKs initialize only when their token env var
  is set **and** `NODE_ENV` / `MODE` is `production`. Local dev always falls through
  to console/Pino logs.

---

## Adding Rollbar calls in new code

**Backend** — import from `lib/rollbar.ts`:
```ts
import { reportError, reportWarning } from '../lib/rollbar.js';

reportError(err);                          // sends at 'error' level
reportError(err, { context: 'extra' });    // with extra metadata
reportWarning('message', { key: 'val' });  // sends at 'warning' level
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

Four `ErrorBoundary` wrappers guard independently-useful UI regions. Each fallback
preserves the component's outer dimensions so the layout does not shift:

| Component | Fallback behaviour |
|---|---|
| `MapView` | Empty `w-full h-full` div |
| `Sidebar` | Empty `w-[260px]` aside (preserves map flex layout) |
| `InfoPanel` | Empty absolute-positioned div (no layout impact) |
| `Scrubber` | Empty `md:h-[52px]` div |

The reusable `<ErrorBoundary name="..." fallback={...}>` lives at
`packages/frontend/src/components/ui/ErrorBoundary.tsx`. It is a plain React class
component that calls `rollbar.error(error, { component: name, componentStack })` in
`componentDidCatch`, and falls back to `console.error` in dev (when `rollbar` is null).

---

## Env vars

| Package | Var | Where set |
|---|---|---|
| `packages/backend` | `ROLLBAR_TOKEN` | Railway environment variables |
| `packages/frontend` | `VITE_ROLLBAR_TOKEN` | Vercel environment variables |

Both env vars are documented in their respective `.env.example` files.
The backend token is a **server-side access token** (secret).
The frontend token is a **client-side access token** (safe to ship in the browser bundle).
