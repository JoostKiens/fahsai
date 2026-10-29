import { afterEach, describe, expect, it } from 'vitest';
import { useTimeStore } from '@/store/timeStore';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { usePm25Timeline } from './usePm25Timeline';

describe('usePm25Timeline', () => {
  afterEach(unmountQueryHooks);

  it('reads an empty range as an empty timeline, which the API answers with a 200', async () => {
    useTimeStore.setState({ latestDate: '2026-10-17', latestDateResolved: true });
    const { settle, latest } = renderQueryHook(usePm25Timeline, () => Response.json({ data: [] }));

    await settle(() => !latest().isPending);

    expect(latest().data).toEqual(new Map());
  });

  it('treats a 404 as a failure, since this route has no no_data answer', async () => {
    useTimeStore.setState({ latestDate: '2026-10-17', latestDateResolved: true });
    const { settle, latest } = renderQueryHook(usePm25Timeline, () =>
      Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 }),
    );

    await settle(() => latest().isError);

    expect(latest().data).toBeUndefined();
  });
});
