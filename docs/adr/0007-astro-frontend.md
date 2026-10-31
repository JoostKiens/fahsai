# ADR 0007 — Build the frontend with Astro

**Date:** 2026-10-31  
**Status:** Accepted

## Context

The frontend was a client-only Vite React SPA. Planned pages (cities, Thai URLs, stations,
explainers) need server-rendered HTML that is refreshed daily, so crawlers and slow connections get
content without running the map.

## Decision

Build with **Astro 7**, the `@astrojs/react` integration and the `@astrojs/vercel` adapter.

- Step 1: two prerendered pages, `/` and `/th/`, with the whole app as one `client:only` island.
- Step 2: the page is four islands, laid out by `src/layouts/AppShell.astro`. The header and the
  sidebar are rendered on the server and hydrated (`client:load`). The map (with its overlay, the
  URL and date sync, the toasts and the analytics) and the scrubber are browser-only
  (`client:only`). They share the Zustand stores and one `QueryClient` (`lib/queryClient.ts`).
- Each island wraps itself in a root that holds an `ErrorBoundary`, so one failing island leaves the
  others running: `ServerIslandRoot` for server-rendered ones (language from a `lang` prop, through
  an i18n provider) and `IslandRoot` for browser-only ones (it loads `@/i18n`, which reads `window`).
- Later steps server-render the scrubber and search (search as its own island, hydrated when idle),
  put the homepage on ISR and move the language choice into a cookie (see JOO-124).
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
- A server-rendered island may only import code that works without a browser: no `window`,
  `document` or `navigator` at import or during render. The stores, Rollbar and i18n guard theirs,
  and `src/ssr.test.tsx` renders the islands in a Node environment, so a regression fails a unit
  test, not the Vercel build.
- Edge middleware does not run for prerendered pages. When the language redirect arrives, `/` must
  be on-demand or ISR, and each request to it invokes an edge function.
- The app loads one network round trip later than under Vite. Vite put four `<script type="module">`
  tags in the head, so the big `vendor-map` chunk started downloading with the HTML. Now an inline
  island script imports `MapIsland.js`, which imports `vendor-map`. Astro adds no `modulepreload`
  hints for `client:only` islands, and the hashed chunk names aren't known when writing the layout,
  so hints would need a build plugin. Revisit if load time on slow connections matters.
- `vite.config.ts` stays for Storybook. App build settings live in `astro.config.mjs`.
