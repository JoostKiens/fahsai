import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTimeStore } from '@/store/timeStore';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { useStationReadings } from './useStationReadings';

const noData = () => Response.json({ error: 'No data', code: 'no_data' }, { status: 404 });
const notFound = () =>
  Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 });

describe('useStationReadings', () => {
  beforeEach(() => {
    useTimeStore.setState({ selectedDate: '2026-10-17', latestDateResolved: true });
  });

  afterEach(unmountQueryHooks);

  it('reads the versioned route of the selected day', async () => {
    const { fetchMock, settle, latest } = renderQueryHook(useStationReadings, noData);

    await settle(() => !latest().isPending);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/station-readings\/latest\?date=2026-10-17$/),
      undefined,
    );
  });

  it('treats a day with no data as empty', async () => {
    const { settle, latest } = renderQueryHook(useStationReadings, noData);

    await settle(() => !latest().isPending);

    expect(latest()).toMatchObject({ data: [], isError: false });
  });

  it('treats any other 404 as a failure, asked once because retrying cannot help', async () => {
    const { fetchMock, settle, latest } = renderQueryHook(useStationReadings, notFound);

    await settle(() => latest().isError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  describe('with a day of its own, for a page without the map', () => {
    it('reads that day, whatever day the map has selected', async () => {
      const { fetchMock, settle, latest } = renderQueryHook(
        () => useStationReadings({ date: '2026-11-04', enabled: true }),
        noData,
      );

      await settle(() => !latest().isPending);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/station-readings\/latest\?date=2026-11-04$/),
        undefined,
      );
    });

    it('reads nothing until it is enabled, even though the map’s day is resolved', () => {
      const { fetchMock } = renderQueryHook(
        () => useStationReadings({ date: '2026-11-04', enabled: false }),
        noData,
      );

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
