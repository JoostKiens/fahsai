import net from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The scripts run on import (top-level await, then process.exit), so everything they call is
// mocked and process.exit is stubbed.
vi.mock('../jobs/cams-ingest.js', () => ({
  runCamsIngest: vi.fn().mockResolvedValue({ stored: 0 }),
}));
vi.mock('../jobs/weather-ingest.js', () => ({
  runWeatherIngest: vi.fn().mockResolvedValue({ stored: 0 }),
}));
vi.mock('../lib/rollbar.js', () => ({
  reportError: vi.fn(),
  waitForRollbar: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../db/client.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }),
    }),
  },
}));

describe('Open-Meteo ingest entrypoints', () => {
  const originalConnectTimeoutMs = net.getDefaultAutoSelectFamilyAttemptTimeout();

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    net.setDefaultAutoSelectFamilyAttemptTimeout(250);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    net.setDefaultAutoSelectFamilyAttemptTimeout(originalConnectTimeoutMs);
  });

  it.each([
    './ingest-cams.js',
    './ingest-cams-today-fallback.js',
    './ingest-weather.js',
    './ingest-weather-today-fallback.js',
  ])('%s allows slow connects at startup (JOO-136)', async (script) => {
    await import(script);

    expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(2_000);
  });
});
