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
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        th: resolve(import.meta.dirname, 'th/index.html'),
      },
      output: {
        // Object-form manualChunks is no longer supported in Vite 8 (Rolldown) — function form
        // is the equivalent, still-supported replacement for this same vendor split.
        manualChunks(id) {
          if (id.includes('/node_modules/rollbar/')) return 'vendor-obs';
          if (
            id.includes('/node_modules/mapbox-gl/') ||
            id.includes('/node_modules/deck.gl/') ||
            id.includes('/node_modules/@deck.gl/mapbox/') ||
            id.includes('/node_modules/@deck.gl/extensions/')
          ) {
            return 'vendor-map';
          }
          if (id.includes('/node_modules/i18next/') || id.includes('/node_modules/react-i18next/')) {
            return 'vendor-i18n';
          }
        },
      },
    },
  },
});
