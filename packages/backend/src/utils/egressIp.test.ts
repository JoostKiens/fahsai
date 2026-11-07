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

  it('does not log a page that is not an address, even with status 200', async () => {
    const page = `<html>${'x'.repeat(5_000)}</html>`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(page)));

    await logEgressIp();

    expect(logSpy).not.toHaveBeenCalled();
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toMatch(/^\[egress-ip\] lookup failed: unexpected response "<html>x+"$/);
    expect(message.length).toBeLessThan(120);
  });

  it('logs an IPv6 address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('2001:db8::7')));

    await logEgressIp();

    expect(logSpy).toHaveBeenCalledWith('[egress-ip] 2001:db8::7');
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
