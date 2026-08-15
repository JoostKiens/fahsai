import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
  },
  build: {
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        th: resolve(import.meta.dirname, 'th/index.html'),
      },
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
                id.includes('/node_modules/i18next/') || id.includes('/node_modules/react-i18next/'),
            },
          ],
        },
      },
    },
  },
});
