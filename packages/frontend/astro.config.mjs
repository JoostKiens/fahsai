import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  adapter: vercel({ staticHeaders: true }),
  server: { port: 5173 },
  // Astro adds script-src 'self' plus a hash per inline script. frame-ancestors can't go in a
  // <meta> CSP (ISR pages get one), so it stays a header in vercel.json.
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
      ],
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
    },
  },
  vite: {
    plugins: [tailwindcss()],
    envPrefix: ['VITE_', 'PUBLIC_'],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
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
