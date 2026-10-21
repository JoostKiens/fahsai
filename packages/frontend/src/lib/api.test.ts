import { describe, expect, it } from 'vitest';
import { apiUrl, isNoData } from './api';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiUrl', () => {
  it('puts a route under /api/v1', () => {
    expect(apiUrl('/fires?date=2026-10-17')).toMatch(/\/api\/v1\/fires\?date=2026-10-17$/);
  });
});

describe('isNoData', () => {
  it('is true for a 404 that says there is no data', async () => {
    expect(await isNoData(json({ error: 'No fire data', code: 'no_data' }, 404))).toBe(true);
  });

  it.each([
    ['an unknown resource', json({ error: 'Station not found', code: 'not_found' }, 404)],
    ['an unknown route', json({ error: 'Route not found', code: 'not_found' }, 404)],
    ['a 404 with no readable body', new Response('<html>', { status: 404 })],
    ['a 404 with a JSON null body', json(null, 404)],
    ['a 200', json({ data: [] }, 200)],
    ['a 500 that says no_data', json({ code: 'no_data' }, 500)],
  ])('is false for %s', async (_name, res) => {
    expect(await isNoData(res)).toBe(false);
  });

  it('leaves the body readable for the caller', async () => {
    const res = json({ code: 'no_data' }, 404);

    await isNoData(res);

    expect(await res.json()).toEqual({ code: 'no_data' });
  });
});
