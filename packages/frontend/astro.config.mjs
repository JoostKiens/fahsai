import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  // The home pages are rendered on demand and cached (ISR), so the scrubber shows the API's latest
  // data. An hour matches how long the API lets its answers be cached; a new day's data shows up
  // within it, and the browser corrects the date as soon as it has loaded.
  // Edge middleware (src/middleware.ts) does the language redirect before the cached page is used.
  adapter: vercel({ isr: { expiration: 60 * 60 }, middlewareMode: 'edge' }),
  server: { port: 5173 },
  // Astro adds script-src 'self' plus a hash per inline script. The pages are rendered on demand, so
  // it sends the CSP as a response header, and that header replaces a CSP header set anywhere else
  // (vercel.json, say) instead of merging with it: every directive, frame-ancestors included, has to
  // be listed here. (A <meta> CSP, which prerendered pages would get, cannot carry frame-ancestors.)
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data: https://api.mapbox.com",
        "font-src 'self' data:",
        "connect-src 'self' data: https://api.mapbox.com https://events.mapbox.com https://*.up.railway.app",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    envPrefix: ['VITE_', 'PUBLIC_'],
    build: {
      // vendor-map (Mapbox GL + Deck.gl) is inherently >500 kB; already split into its own chunk.
      chunkSizeWarningLimit: 2500,
      rolldownOptions: {
        output: {
          // Native Rolldown chunk splitting — replaces the deprecated manualChunks. Same-named
          // groups each produce their own chunk file (not merged), so each vendor bundle is one
          // group with a predicate matching every package that belongs in it.
          codeSplitting: {
            groups: [
              { name: 'vendor-obs', test: (id) => id.includes('/node_modules/rollbar/') },
              {
                name: 'vendor-map',
                test: (id) =>
                  id.includes('/node_modules/mapbox-gl/') ||
                  id.includes('/node_modules/deck.gl/') ||
                  id.includes('/node_modules/@deck.gl/mapbox/') ||
                  id.includes('/node_modules/@deck.gl/extensions/'),
              },
              {
                name: 'vendor-i18n',
                test: (id) =>
                  id.includes('/node_modules/i18next/') ||
                  id.includes('/node_modules/react-i18next/'),
              },
            ],
          },
        },
      },
    },
  },
});
