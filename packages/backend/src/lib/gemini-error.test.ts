import { describe, expect, it } from 'vitest';
import type { ApiError } from '@thailand-aq/types';
import { classifyGeminiError, formatStreamError, nextMidnightPT } from './gemini-error.js';

const NOW_MS = Date.parse('2026-10-18T12:00:00Z');

describe('classifyGeminiError', () => {
  it('treats an HTTP 429 as a per-minute limit that resets in a minute', () => {
    const err = Object.assign(new Error('Too Many Requests'), { status: 429 });

    expect(classifyGeminiError(err, NOW_MS)).toEqual({
      error: 'Gemini rate limit reached',
      code: 'rate_limited',
      reason: 'gemini_rpm',
      resetAtMs: NOW_MS + 60_000,
    });
  });

  it('recognises a rate limit from the message alone', () => {
    const err = new Error('[429] RESOURCE_EXHAUSTED: quota exceeded');

    expect(classifyGeminiError(err, NOW_MS)).toMatchObject({
      code: 'rate_limited',
      reason: 'gemini_rpm',
    });
  });

  it('treats a daily limit as resetting at the next Los Angeles midnight', () => {
    const err = new Error('Quota exceeded for requests per day');

    expect(classifyGeminiError(err, NOW_MS)).toMatchObject({
      reason: 'gemini_rpd',
      resetAtMs: Date.parse('2026-10-19T07:00:00Z'),
    });
  });

  it('treats a token limit as a per-minute token limit', () => {
    const err = new Error('Rate limit: too many tokens per minute');

    expect(classifyGeminiError(err, NOW_MS)).toMatchObject({ reason: 'gemini_tpm' });
  });

  it.each([
    ['an Error', new Error('fetch failed: ECONNRESET to https://generativelanguage.example')],
    ['a string', 'something broke'],
    ['undefined', undefined],
  ])('answers %s with a generic unavailable error and none of its text', (_name, err) => {
    const error = classifyGeminiError(err, NOW_MS);

    expect(error).toEqual({ error: 'Explanation unavailable', code: 'unavailable' });
  });
});

describe('nextMidnightPT', () => {
  it('uses the daylight-saving offset (UTC-7) in October', () => {
    expect(nextMidnightPT(Date.parse('2026-10-18T12:00:00Z'))).toBe(
      Date.parse('2026-10-19T07:00:00Z'),
    );
  });

  it('uses the standard offset (UTC-8) in December', () => {
    expect(nextMidnightPT(Date.parse('2026-12-10T12:00:00Z'))).toBe(
      Date.parse('2026-12-11T08:00:00Z'),
    );
  });
});

describe('formatStreamError', () => {
  it('puts the error on its own last line as one line of JSON', () => {
    const error: ApiError = { error: 'a "quoted" ] bracket', code: 'unavailable' };

    const text = `Hello${formatStreamError(error)}`;

    expect(text.split('\n')).toHaveLength(2);
    expect(text.endsWith(']')).toBe(true);
  });

  it('round-trips through the sentinel pattern the frontend uses, even with brackets in the text', () => {
    const error: ApiError = { error: 'has ] and } inside', code: 'unavailable' };

    const match = /\[ERROR_JSON:(.*)\]\s*$/s.exec(formatStreamError(error));

    expect(JSON.parse(match?.[1] ?? 'null')).toEqual(error);
  });
});
