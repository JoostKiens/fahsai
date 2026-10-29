import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTimeStore } from '@/store/timeStore';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { useStationHistory } from './useStationHistory';

// The route never answers "no data" with a 404, so a 404 is a failure the server has answered.
describe('useStationHistory', () => {
  beforeEach(() => {
    useTimeStore.setState({ selectedDate: '2026-10-17' });
  });

  afterEach(unmountQueryHooks);

  it('fails a 404 after one request, because asking again cannot help', async () => {
    const { client, fetchMock, settle } = renderQueryHook(
      () => useStationHistory('s1'),
      () => Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 }),
    );

    await settle(
      () =>
        client.getQueryCache().find({ queryKey: ['station-history', 's1'], exact: false })?.state
          .status === 'error',
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining('/api/v1/stations/s1/history'),
    ]);
  });
});
