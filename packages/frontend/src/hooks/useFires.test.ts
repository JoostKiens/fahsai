import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTimeStore } from '@/store/timeStore';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { useFires } from './useFires';

const noData = () => Response.json({ error: 'No fire data', code: 'no_data' }, { status: 404 });
const notFound = () =>
  Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 });

describe('useFires', () => {
  beforeEach(() => {
    useTimeStore.setState({ selectedDate: '2026-10-17', latestDateResolved: true });
  });

  afterEach(unmountQueryHooks);

  it('reads the versioned route', async () => {
    const { fetchMock, settle, latest } = renderQueryHook(useFires, () =>
      Response.json({ data: [] }),
    );

    await settle(() => !latest().isPending);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/fires\?date=2026-10-17$/),
      undefined,
    );
  });

  it('treats a day with no data as empty', async () => {
    const { settle, latest } = renderQueryHook(useFires, noData);

    await settle(() => !latest().isPending);

    expect(latest()).toMatchObject({ data: [], isError: false });
  });

  it('treats any other 404 as a failure, asked once because retrying cannot help', async () => {
    const { fetchMock, settle, latest } = renderQueryHook(useFires, notFound);

    await settle(() => latest().isError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the previous date while the next loads, when asked', async () => {
    const respond = (url: string) => Response.json({ data: [{ id: url.endsWith('17') ? 1 : 2 }] });
    const { settle, latest } = renderQueryHook(() => useFires({ keepPrevious: true }), respond);
    await settle(() => latest().isSuccess);

    act(() => useTimeStore.setState({ selectedDate: '2026-10-18' }));

    expect(latest()).toMatchObject({ data: [{ id: 1 }], isPlaceholderData: true });
    await settle(() => !latest().isPlaceholderData);
    expect(latest().data).toEqual([{ id: 2 }]);
  });

  it('has no data for the next date while it loads, by default', async () => {
    const { settle, latest } = renderQueryHook(useFires, () => Response.json({ data: [] }));
    await settle(() => latest().isSuccess);

    act(() => useTimeStore.setState({ selectedDate: '2026-10-18' }));

    expect(latest().data).toBeUndefined();
  });
});
