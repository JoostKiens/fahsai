import { describe, expect, it } from 'vitest';
import { MS_PER_HOUR } from '@thailand-aq/consts';
import {
  parseApiError,
  parseStreamError,
  toRateLimit,
  withoutStreamError,
} from './utils.api-error';

const NOW_MS = 1_700_000_000_000;

describe('parseApiError', () => {
  it('reads a rate-limit body with its reason and reset time', () => {
    const body = {
      error: 'Rate limit exceeded',
      code: 'rate_limited',
      reason: 'ip_ratelimit',
      resetAtMs: 123,
    };

    expect(parseApiError(body)).toEqual(body);
  });

  it('reads a plain error without a reason', () => {
    expect(parseApiError({ error: 'Station not found', code: 'not_found' })).toEqual({
      error: 'Station not found',
      code: 'not_found',
    });
  });

  it('drops a reason it does not know instead of trusting it', () => {
    expect(parseApiError({ error: 'x', code: 'rate_limited', reason: 'mystery' })).toEqual({
      error: 'x',
      code: 'rate_limited',
    });
  });

  it.each([
    ['null', null],
    ['a string', 'oops'],
    ['an array', ['x']],
    ['a body without an error text', { code: 'internal' }],
    ['a body with an unknown code', { error: 'x', code: 'weird' }],
    ['the old rate-limit body', { type: 'ip_ratelimit', resetAtMs: 123 }],
  ])('rejects %s', (_name, value) => {
    expect(parseApiError(value)).toBeNull();
  });
});

describe('stream errors', () => {
  const rateLimited = {
    error: 'Gemini rate limit reached',
    code: 'rate_limited',
    reason: 'gemini_rpd',
    resetAtMs: 456,
  };
  const withError = (text: string, error: object) =>
    `${text}\n[ERROR_JSON:${JSON.stringify(error)}]`;

  it('has no error when the stream carries none', () => {
    expect(parseStreamError('Just an explanation.')).toBeNull();
  });

  it('reads the error line at the end of the stream', () => {
    expect(parseStreamError(withError('Some text', rateLimited))).toEqual(rateLimited);
  });

  it('reads it when the stream failed before any text', () => {
    expect(parseStreamError(withError('', rateLimited))).toEqual(rateLimited);
  });

  it('reads an error whose text contains brackets and braces', () => {
    const error = { error: 'odd ] and } and [ERROR_JSON: inside', code: 'unavailable' };

    expect(parseStreamError(withError('text', error))).toEqual(error);
  });

  it('treats an error line that was cut off as the explanation being unavailable', () => {
    expect(parseStreamError('text\n[ERROR_JSON:{"error":"Gemini rate')).toMatchObject({
      code: 'unavailable',
    });
  });

  it('treats an error line it cannot read as the explanation being unavailable', () => {
    expect(parseStreamError('text\n[ERROR_JSON:not json]')).toMatchObject({
      code: 'unavailable',
    });
  });

  it('shows the text without the error line, even while the line is still arriving', () => {
    expect(withoutStreamError(withError('Some text', rateLimited))).toBe('Some text');
    expect(withoutStreamError('Some text\n[ERROR_JSON:{"err')).toBe('Some text');
    expect(withoutStreamError('Some text')).toBe('Some text');
  });
});

describe('toRateLimit', () => {
  it('keeps the reason and reset time of the error', () => {
    expect(
      toRateLimit(
        { error: 'x', code: 'rate_limited', reason: 'gemini_rpm', resetAtMs: 99 },
        NOW_MS,
      ),
    ).toEqual({ reason: 'gemini_rpm', resetAtMs: 99 });
  });

  it('falls back to the daily quota, an hour away, when the error has neither', () => {
    expect(toRateLimit({ error: 'x', code: 'rate_limited' }, NOW_MS)).toEqual({
      reason: 'quota_exceeded',
      resetAtMs: NOW_MS + MS_PER_HOUR,
    });
  });

  it('falls back the same way when there was no readable body', () => {
    expect(toRateLimit(null, NOW_MS)).toEqual({
      reason: 'quota_exceeded',
      resetAtMs: NOW_MS + MS_PER_HOUR,
    });
  });
});
