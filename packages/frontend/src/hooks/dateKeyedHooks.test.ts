import type { UseQueryResult } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTimeStore } from '@/store/timeStore';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { useCamsGrid } from './useCamsGrid';
import { useStationReadings } from './useStationReadings';
import { useWind } from './useWind';

const noData = () => Response.json({ error: 'No data', code: 'no_data' }, { status: 404 });
const notFound = () =>
  Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 });

// What the tests read of each hook's result; the hooks differ in the type of their data.
type Outcome = Pick<UseQueryResult<unknown[]>, 'isPending' | 'isError' | 'data'>;
const hooks: [name: string, useHook: () => Outcome, path: string][] = [
  ['useWind', useWind, '/api/v1/weather/wind'],
  ['useCamsGrid', useCamsGrid, '/api/v1/cams'],
  ['useStationReadings', useStationReadings, '/api/v1/station-readings/latest'],
];

// Each of these hooks reads a date-keyed route, so an empty day is a 404 with code no_data.
describe.each(hooks)('%s', (_name, useHook, path) => {
  beforeEach(() => {
    useTimeStore.setState({ selectedDate: '2026-10-17', latestDateResolved: true });
  });

  afterEach(unmountQueryHooks);

  it('reads the versioned route of the selected day', async () => {
    const { fetchMock, settle, latest } = renderQueryHook(useHook, () => noData());

    await settle(() => !latest().isPending);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`${path}\\?date=2026-10-17$`)),
      undefined,
    );
  });

  it('treats a day with no data as empty', async () => {
    const { settle, latest } = renderQueryHook(useHook, noData);

    await settle(() => !latest().isPending);

    expect(latest()).toMatchObject({ data: [], isError: false });
  });

  it('treats any other 404 as a failure, asked once because retrying cannot help', async () => {
    const { fetchMock, settle, latest } = renderQueryHook(useHook, notFound);

    await settle(() => latest().isError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
