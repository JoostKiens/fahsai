import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  integrations: [react()],
  adapter: vercel({ staticHeaders: true }),
  server: { port: 5173 },
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
