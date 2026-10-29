import { afterEach, describe, expect, it } from 'vitest';
import { renderQueryHook, unmountQueryHooks } from '@/test/queryHookHarness';
import { useNearestCamsPoint } from './useNearestCamsPoint';

describe('useNearestCamsPoint', () => {
  afterEach(unmountQueryHooks);

  const useHook = () => useNearestCamsPoint('2026-10-17', 13.7, 100.5);

  it('treats a day with no data as no point', async () => {
    const { settle, latest } = renderQueryHook(useHook, () =>
      Response.json({ error: 'No CAMS grid data', code: 'no_data' }, { status: 404 }),
    );

    await settle(() => !latest().isPending);

    expect(latest()).toMatchObject({ data: null, isError: false });
  });

  it('treats any other 404 as a failure', async () => {
    const { settle, latest } = renderQueryHook(useHook, () =>
      Response.json({ error: 'Route not found', code: 'not_found' }, { status: 404 }),
    );

    await settle(() => latest().isError);

    expect(latest().data).toBeUndefined();
  });
});
