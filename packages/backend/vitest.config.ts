import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // need a database: run with `pnpm test:integration`
    exclude: [...configDefaults.exclude, 'src/**/*.integration.test.ts'],
  },
});
