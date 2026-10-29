import { afterEach, describe, expect, it } from 'vitest';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { useLatestDate } from './useLatestDate';

// The route never answers "no data" with a 404, so a 404 is a failure the server has answered.
describe('useLatestDate', () => {
  afterEach(unmountQueryHooks);

  it('fails a 404 after one request, because asking again cannot help', async () => {
    const { client, fetchMock, settle } = renderQueryHook(
      () => useLatestDate(),
      () => Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 }),
    );

    await settle(
      () =>
        client.getQueryCache().find({ queryKey: ['latest-date'], exact: false })?.state.status ===
        'error',
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('/api/v1/latest-date'),
    ]);
  });
});
