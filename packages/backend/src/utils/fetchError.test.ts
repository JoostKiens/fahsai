import { describe, it, expect } from 'vitest';
import { describeFetchError } from './fetchError.js';

describe('describeFetchError', () => {
  it('lists every address from a happy-eyeballs AggregateError', () => {
    const cause = new AggregateError([
      new Error('connect ENETUNREACH 2a0a:4cc0:c0:2003::1:443'),
      new Error('connect ETIMEDOUT 152.53.84.73:443'),
    ]);
    const err = new TypeError('fetch failed', { cause });
    expect(describeFetchError(err)).toBe(
      'connect ENETUNREACH 2a0a:4cc0:c0:2003::1:443; connect ETIMEDOUT 152.53.84.73:443',
    );
  });

  it("keeps the addresses from undici's connect timeout message", () => {
    const cause = Object.assign(
      new Error('Connect Timeout Error (attempted address: 152.53.84.73:443, timeout: 10000ms)'),
      { code: 'UND_ERR_CONNECT_TIMEOUT' },
    );
    expect(describeFetchError(new TypeError('fetch failed', { cause }))).toBe(
      'Connect Timeout Error (attempted address: 152.53.84.73:443, timeout: 10000ms)',
    );
  });

  it('falls back to the code when the message is empty', () => {
    const cause = Object.assign(new Error(''), { code: 'ECONNRESET' });
    expect(describeFetchError(new TypeError('fetch failed', { cause }))).toBe('ECONNRESET');
  });

  it('returns undefined without an Error cause, and never throws', () => {
    expect(describeFetchError(new Error('aborted'))).toBeUndefined();
    expect(describeFetchError(null)).toBeUndefined();
    expect(describeFetchError(undefined)).toBeUndefined();
    const withNull = new TypeError('fetch failed', { cause: new AggregateError([null]) });
    expect(describeFetchError(withNull)).toBe('null');
  });
});
