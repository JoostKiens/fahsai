# ADR 0007 — Build the frontend with Astro

**Date:** 2026-10-31  
**Status:** Accepted

## Context

The frontend was a client-only Vite React SPA. Planned pages (cities, Thai URLs, stations,
explainers) need server-rendered HTML that is refreshed daily, so crawlers and slow connections get
content without running the map.

## Decision

Build with **Astro 7**, the `@astrojs/react` integration and the `@astrojs/vercel` adapter.

- Step 1 (this record): the whole current app is one `client:only` island (`src/AppIsland.tsx`)
  in two prerendered pages, `/` and `/th/`. Nothing visible changes.
- Later steps server-render the header, sidebar, scrubber and search, put the homepage on ISR and
  move the language choice into a cookie (see JOO-124).
- The CSP is written by Astro (`security.csp`, `staticHeaders`): `script-src 'self'` plus a hash per
  inline script. `vercel.json` keeps only `frame-ancestors`, because a second full CSP header would
  block the hashed scripts and a `<meta>` CSP (what ISR pages get) cannot carry `frame-ancestors`.

## Alternatives considered

- **Next.js:** heavier, and the map would still be a client-only island. Astro ships no framework
  runtime for server-rendered parts.
- **Vite SSR with a plugin:** we would build and maintain the routing, prerender and Vercel output
  ourselves.

## Consequences

- A `client:only` island must live in its own module. Importing it beside a server-rendered island
  pulls `window` reads (stores, i18n, Rollbar) into the server build.
- Edge middleware does not run for prerendered pages. When the language redirect arrives, `/` must
  be on-demand or ISR, and each request to it invokes an edge function.
- `vite.config.ts` stays for Storybook. App build settings live in `astro.config.mjs`.
