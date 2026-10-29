import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTimeStore } from '@/store/timeStore';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { usePrefetchAdjacentDates } from './usePrefetchAdjacentDates';

const noData = () => Response.json({ error: 'No data', code: 'no_data' }, { status: 404 });

describe('usePrefetchAdjacentDates', () => {
  beforeEach(() => {
    useTimeStore.setState({
      selectedDate: '2026-10-17',
      latestDate: '2026-10-18',
      latestDateResolved: true,
    });
  });

  afterEach(unmountQueryHooks);

  // The neighbouring day has no data of any kind: every prefetch must cache an empty day, as the
  // hook of the same data does, so that moving to that day is an instant empty hit.
  it.each([
    ['fires', ['fires', '2026-10-16']],
    ['station readings', ['aqi-latest', 'pm25', '2026-10-16']],
    ['cams grid', ['cams-grid', '2026-10-16']],
    ['wind', ['weather-wind', '2026-10-16']],
  ])('caches an empty day for %s when the neighbour has no data', async (_name, queryKey) => {
    const { client, settle } = renderQueryHook(usePrefetchAdjacentDates, noData);

    await settle(() => client.getQueryData(queryKey) !== undefined);

    expect(client.getQueryData(queryKey)).toEqual([]);
  });
});
