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
- The CSP is written by Astro (`security.csp`) as a `<meta>` tag in each page: `script-src 'self'`
  plus a hash per inline script. `vercel.json` keeps only `frame-ancestors`, which a `<meta>` CSP
  cannot carry. We do not use the adapter's `staticHeaders`: on Vercel its per-route header replaces
  `vercel.json`'s CSP header instead of merging (so `frame-ancestors` was lost), and it keys the
  Thai page as `/th`, which misses `/th/`. A `<meta>` CSP works the same for prerendered and ISR pages.

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
- The app loads one network round trip later than under Vite. Vite put four `<script type="module">`
  tags in the head, so the big `vendor-map` chunk started downloading with the HTML. Now an inline
  island script imports `AppIsland.js`, which imports `vendor-map`. Astro adds no `modulepreload`
  hints for `client:only` islands, and the hashed chunk names aren't known when writing the layout,
  so hints would need a build plugin. Revisit if load time on slow connections matters.
- `vite.config.ts` stays for Storybook. App build settings live in `astro.config.mjs`.
