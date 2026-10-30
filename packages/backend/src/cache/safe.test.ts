import { describe, it, expect, vi, beforeEach } from 'vitest';

const { redisGet, redisSet, redisDel, reportError } = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock('./client.js', () => ({ redis: { get: redisGet, set: redisSet, del: redisDel } }));
vi.mock('../lib/rollbar.js', () => ({ reportError }));
vi.mock('../lib/logger.js', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import { cacheGet, cacheSet, cacheReplace, cacheDel } from './safe.js';

const upstashStopped = new Error('database is stopped');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('cacheGet', () => {
  it('returns the cached value', async () => {
    redisGet.mockResolvedValue(['a']);
    expect(await cacheGet('k')).toEqual(['a']);
  });

  it('returns null on a miss', async () => {
    redisGet.mockResolvedValue(null);
    expect(await cacheGet('k')).toBeNull();
  });

  it('returns null instead of throwing when Redis fails', async () => {
    redisGet.mockRejectedValue(upstashStopped);
    expect(await cacheGet('k')).toBeNull();
  });
});

describe('cacheSet', () => {
  it('writes with the given TTL', async () => {
    redisSet.mockResolvedValue('OK');
    expect(await cacheSet('k', [1], { ex: 60 })).toBe(true);
    expect(redisSet).toHaveBeenCalledWith('k', [1], { ex: 60 });
  });

  it('returns false instead of throwing when Redis fails', async () => {
    redisSet.mockRejectedValue(upstashStopped);
    expect(await cacheSet('k', [1], { ex: 60 })).toBe(false);
  });
});

describe('cacheReplace', () => {
  it('writes the new value and leaves the key in place', async () => {
    redisSet.mockResolvedValue('OK');
    expect(await cacheReplace('k', [1], { ex: 60 })).toBe(true);
    expect(redisDel).not.toHaveBeenCalled();
  });

  it('deletes the old value when the write fails', async () => {
    redisSet.mockRejectedValue(upstashStopped);
    redisDel.mockResolvedValue(1);
    expect(await cacheReplace('k', [1], { ex: 60 })).toBe(false);
    expect(redisDel).toHaveBeenCalledWith('k');
  });

  it('reports when neither the write nor the delete lands', async () => {
    redisSet.mockRejectedValue(upstashStopped);
    redisDel.mockRejectedValue(upstashStopped);
    expect(await cacheReplace('k', [1], { ex: 60 })).toBe(false);
    expect(reportError).toHaveBeenCalledWith(upstashStopped, { keys: ['k'] });
  });
});

describe('cacheDel', () => {
  it('deletes every key in one call', async () => {
    redisDel.mockResolvedValue(2);
    await cacheDel('a', 'b');
    expect(redisDel).toHaveBeenCalledWith('a', 'b');
  });

  it('reports the failure with the keys instead of throwing', async () => {
    redisDel.mockRejectedValue(upstashStopped);
    await expect(cacheDel('a', 'b')).resolves.toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(upstashStopped, { keys: ['a', 'b'] });
  });
});
