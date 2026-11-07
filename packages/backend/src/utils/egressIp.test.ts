import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { logEgressIp } from './egressIp.js';

describe('logEgressIp', () => {
  let logSpy: MockInstance<typeof console.log>;
  let warnSpy: MockInstance<typeof console.warn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('logs the address the lookup service returns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('203.0.113.7\n')));

    await logEgressIp();

    expect(logSpy).toHaveBeenCalledWith('[egress-ip] 203.0.113.7');
  });

  it('warns and returns when the service answers with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('busy', { status: 503 })));

    await expect(logEgressIp()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith('[egress-ip] lookup failed: HTTP 503');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warns and returns when the lookup times out', async () => {
    const timeout = new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));

    await expect(logEgressIp()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      '[egress-ip] lookup failed: The operation was aborted due to timeout',
    );
  });

  it('warns with the cause when the connection fails', async () => {
    const failure = new TypeError('fetch failed', {
      cause: new Error('connect ETIMEDOUT 1.2.3.4:443'),
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(failure));

    await expect(logEgressIp()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      '[egress-ip] lookup failed: fetch failed (connect ETIMEDOUT 1.2.3.4:443)',
    );
  });
});
