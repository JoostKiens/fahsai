import { describe, it, expect } from 'vitest';
import { corsOriginHeader } from './cors.js';

describe('corsOriginHeader', () => {
  it('echoes back an allowed origin', () => {
    expect(corsOriginHeader('https://fahsai.fyi')).toBe('https://fahsai.fyi');
  });

  it('returns undefined for a disallowed origin', () => {
    expect(corsOriginHeader('https://evil.example')).toBeUndefined();
  });

  it('returns undefined when no origin header is present', () => {
    expect(corsOriginHeader(undefined)).toBeUndefined();
  });
});
