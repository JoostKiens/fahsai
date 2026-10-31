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
  URL and date sync, the toasts and the analytics) is browser-only (`client:only`). They share the
  Zustand stores and one `QueryClient` (`lib/queryClient.ts`).
- Step 3: the scrubber is server-rendered too, with the API's latest date and PM2.5 timeline fetched
  while the page renders (`lib/scrubberData.ts`; when the API cannot be reached the page renders
  the scrubber's placeholders and the browser loads the data, as before). `/` and `/th/` are on
  demand and cached with ISR (`isr.expiration` of an hour, which is how long the API lets its answers
  be cached). The cache key ignores the query string, so shared `?date=` links do not each get a
  page. Search stays inside the header island: `fuse.js` is about 9 KB gzipped, against about 630 KB
  for the map, so a separate island hydrated when idle was not worth rebuilding the header in Astro.
- A server-rendered island hydrates against its stores' initial state, so `uiStore` and `timeStore`
  start from defaults and apply the URL right after they are created. Browser-only islands first
  render after that and see no difference.
- Each island wraps itself in a root that holds an `ErrorBoundary`, so one failing island leaves the
  others running: `ServerIslandRoot` for server-rendered ones (language from a `lang` prop, through
  an i18n provider) and `IslandRoot` for browser-only ones (it loads `@/i18n`, which reads `window`).
- A later step moves the language choice into a cookie (see JOO-124).
- The CSP is written by Astro (`security.csp`): `script-src 'self'` plus a hash per inline script.
  The pages are on demand, so Astro sends it as a response header, and that header replaces a CSP
  header set anywhere else (it did to `vercel.json`'s, which was removed, and `staticHeaders` did
  the same). So every directive, `frame-ancestors` included, is in Astro's list. Nothing tests this:
  it was found by reading a preview's headers. Check them after changing the CSP or adding a
  prerendered page, whose CSP would be a `<meta>` tag that cannot carry `frame-ancestors`.

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
- Edge middleware does not run for prerendered pages. The home pages are on demand now, so the
  language redirect can run on `/`; each request then invokes an edge function (Vercel Hobby's
  limits are not checked).
- A page rendered while the API was down is cached with the placeholders for up to an hour; the
  browser then loads everything itself, as it did before step 3. The page function runs in
  Vercel's default region and the API is in Singapore: one refresh makes two calls, one after the
  other.
- The app loads one network round trip later than under Vite. Vite put four `<script type="module">`
  tags in the head, so the big `vendor-map` chunk started downloading with the HTML. Now an inline
  island script imports `MapIsland.js`, which imports `vendor-map`. Astro adds no `modulepreload`
  hints for `client:only` islands, and the hashed chunk names aren't known when writing the layout,
  so hints would need a build plugin. Revisit if load time on slow connections matters.
- `vite.config.ts` stays for Storybook. App build settings live in `astro.config.mjs`.
