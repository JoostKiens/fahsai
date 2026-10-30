import { describe, it, expect, vi } from 'vitest';

// vi.mock is hoisted before imports by Vitest — openmeteo.ts imports grid
// constants from computeStationWeather.ts, which imports db/client.ts at
// module scope and throws when SUPABASE_* env vars are absent in tests.
vi.mock('../db/client.js', () => ({ supabase: {} }));

import { describeConnectError, targetHourIndex } from './openmeteo.js';

describe('describeConnectError', () => {
  const socketError = (address: string, code: string) =>
    Object.assign(new Error(`connect ${code} ${address}:443`), { address, code });

  it('lists every address from a happy-eyeballs AggregateError', () => {
    const cause = new AggregateError([
      socketError('2a0a:4cc0:c0:2003::1', 'ENETUNREACH'),
      socketError('152.53.84.73', 'ETIMEDOUT'),
    ]);
    const err = new TypeError('fetch failed', { cause });
    expect(describeConnectError(err)).toBe(
      '2a0a:4cc0:c0:2003::1 ENETUNREACH, 152.53.84.73 ETIMEDOUT',
    );
  });

  it('handles a single socket error cause', () => {
    const err = new TypeError('fetch failed', { cause: socketError('152.53.84.73', 'ECONNRESET') });
    expect(describeConnectError(err)).toBe('152.53.84.73 ECONNRESET');
  });

  it('reports a missing cause', () => {
    expect(describeConnectError(new Error('The operation was aborted due to timeout'))).toBe(
      'no cause',
    );
  });
});

describe('targetHourIndex', () => {
  it('picks the exact match when the target hour is present', () => {
    const times = ['2026-07-16T00:00', '2026-07-16T13:00', '2026-07-16T14:00', '2026-07-16T15:00'];
    expect(targetHourIndex(times, 14)).toBe(2);
  });

  it('picks the closest hour when the target hour is missing', () => {
    const times = ['2026-07-16T00:00', '2026-07-16T12:00', '2026-07-16T15:00', '2026-07-16T18:00'];
    // 15:00 (diff 1) is closer to the 14:00 target than 12:00 (diff 2).
    expect(targetHourIndex(times, 14)).toBe(2);
  });

  it('returns 0 for an empty array', () => {
    expect(targetHourIndex([], 14)).toBe(0);
  });

  it('ignores entries with no parseable hour', () => {
    const times = ['not-a-time', '2026-07-16T14:00'];
    expect(targetHourIndex(times, 14)).toBe(1);
  });
});
