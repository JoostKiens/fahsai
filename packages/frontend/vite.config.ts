import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        th: resolve(__dirname, 'th/index.html'),
      },
      output: {
        manualChunks: { 'vendor-obs': ['rollbar'] },
      },
    },
  },
});
