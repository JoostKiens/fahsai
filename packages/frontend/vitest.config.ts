import { defineConfig } from 'vitest/config';
import { resolve } from 'path';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          globals: true,
          environment: 'jsdom',
          setupFiles: ['src/test/setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        // Runs every story as a test in real Chromium; see `test:storybook`.
        extends: true,
        // vitest.config.ts replaces vite.config.ts, so Tailwind must be re-added for stories to be styled.
        plugins: [
          tailwindcss(),
          storybookTest({ configDir: resolve(import.meta.dirname, '.storybook') }),
        ],
        // Pre-bundle the map libraries: discovering them mid-run makes Vite reload and fail the
        // first cold run.
        optimizeDeps: {
          include: [
            '@deck.gl/core',
            '@deck.gl/extensions',
            '@deck.gl/geo-layers',
            '@deck.gl/layers',
            'supercluster',
          ],
        },
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
