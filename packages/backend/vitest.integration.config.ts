import { defineConfig } from 'vitest/config';

// Real-DB tests against a local Supabase (see scripts/test-integration.sh). Not part of `pnpm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./src/test/integration/global-setup.ts'],
    // every file shares one database
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
