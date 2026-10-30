import { describe, it, expect } from 'vitest';
import { corsOriginHeader } from './cors.js';

describe('corsOriginHeader', () => {
  it('echoes back an allowed origin', () => {
    expect(corsOriginHeader('https://fahsai.fyi')).toBe('https://fahsai.fyi');
  });

  it('echoes back a Vercel preview origin of this project', () => {
    const preview =
      'https://fahsai-git-joo-81-fahsai-p32-table-7b089e-joost-kiens-projects.vercel.app';
    expect(corsOriginHeader(preview)).toBe(preview);
  });

  it('rejects other vercel.app origins', () => {
    expect(corsOriginHeader('https://other-joost-kiens-projects.vercel.app')).toBeUndefined();
    expect(
      corsOriginHeader('https://fahsai-x-joost-kiens-projects.vercel.app.evil.example'),
    ).toBeUndefined();
  });

  it('returns undefined for a disallowed origin', () => {
    expect(corsOriginHeader('https://evil.example')).toBeUndefined();
  });

  it('returns undefined when no origin header is present', () => {
    expect(corsOriginHeader(undefined)).toBeUndefined();
  });
});
