import { afterEach, describe, expect, it } from 'vitest';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { usePowerPlants } from './usePowerPlants';

// The route never answers "no data" with a 404, so a 404 is a failure the server has answered.
describe('usePowerPlants', () => {
  afterEach(unmountQueryHooks);

  it('fails a 404 after one request, because asking again cannot help', async () => {
    const { client, fetchMock, settle } = renderQueryHook(
      () => usePowerPlants(true),
      () => Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 }),
    );

    await settle(
      () =>
        client.getQueryCache().find({ queryKey: ['power-plants'], exact: false })?.state.status ===
        'error',
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('/api/v1/power-plants'),
    ]);
  });
});
