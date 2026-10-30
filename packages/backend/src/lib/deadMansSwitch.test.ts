import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pingDeadMansSwitch } from './deadMansSwitch.js';

const mockFetch = vi.fn<typeof fetch>();
const pingUrl = 'https://hc-ping.example/uuid';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', mockFetch);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mockFetch.mockResolvedValue(new Response('OK'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pingDeadMansSwitch', () => {
  it('pings the success URL when the run found no problems', async () => {
    await pingDeadMansSwitch({ pingUrl, hasFailed: false });
    expect(mockFetch.mock.calls[0][0]).toBe(pingUrl);
  });

  it('pings /fail when the run found a problem or crashed', async () => {
    await pingDeadMansSwitch({ pingUrl, hasFailed: true });
    expect(mockFetch.mock.calls[0][0]).toBe(`${pingUrl}/fail`);
  });

  it('resolves when the ping itself fails, so the job still exits normally', async () => {
    mockFetch.mockRejectedValue(new TypeError('fetch failed'));
    await expect(pingDeadMansSwitch({ pingUrl, hasFailed: false })).resolves.toBeUndefined();
  });
});
