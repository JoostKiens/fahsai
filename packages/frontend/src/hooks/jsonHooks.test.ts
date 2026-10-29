import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { QueryKey } from '@tanstack/react-query';
import { useStationBaseline } from '@/components/InfoPanel/useStationBaseline';
import { useStationHistory } from '@/components/InfoPanel/useStationHistory';
import { useTimeStore } from '@/store/timeStore';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { useLatestDate } from './useLatestDate';
import { usePm25Timeline } from './usePm25Timeline';
import { usePowerPlants } from './usePowerPlants';

const notFound = () =>
  Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 });

// Hooks for routes that never answer "no data" with a 404: whatever the API says, a failure is a
// failure, and one the server has answered is not asked again.
const hooks: [name: string, useHook: () => unknown, path: string, queryKey: QueryKey][] = [
  ['usePowerPlants', () => usePowerPlants(true), '/api/v1/power-plants', ['power-plants']],
  [
    'useStationBaseline',
    () => useStationBaseline('s1', true),
    '/api/v1/stations/s1/baseline',
    ['station-baseline', 's1'],
  ],
  [
    'useStationHistory',
    () => useStationHistory('s1'),
    '/api/v1/stations/s1/history',
    ['station-history', 's1'],
  ],
  ['useLatestDate', () => useLatestDate(), '/api/v1/latest-date', ['latest-date']],
  ['usePm25Timeline', usePm25Timeline, '/api/v1/cams/summary', ['cams-summary']],
];

describe.each(hooks)('%s', (_name, useHook, path, queryKey) => {
  beforeEach(() => {
    useTimeStore.setState({
      selectedDate: '2026-10-17',
      latestDate: '2026-10-17',
      latestDateResolved: true,
    });
  });

  afterEach(unmountQueryHooks);

  it('fails a 404 after one request, because asking again cannot help', async () => {
    const { client, fetchMock, settle } = renderQueryHook(useHook, notFound);

    await settle(
      () => client.getQueryCache().find({ queryKey, exact: false })?.state.status === 'error',
    );

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([expect.stringContaining(path)]);
  });
});
