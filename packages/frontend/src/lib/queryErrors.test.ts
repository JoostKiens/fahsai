import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastError, rollbarError } = vi.hoisted(() => ({
  toastError: vi.fn(),
  rollbarError: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: toastError } }));
vi.mock('@/lib/rollbar', () => ({ rollbar: { error: rollbarError } }));

import { HttpError } from './api';
import { handleQueryError } from './queryErrors';

describe('handleQueryError', () => {
  beforeEach(() => {
    toastError.mockReset();
    rollbarError.mockReset();
  });

  it('shows one toast that later failures replace', () => {
    handleQueryError(new HttpError('fires fetch failed: 500', 500));
    handleQueryError(new HttpError('wind fetch failed: 500', 500));

    expect(toastError.mock.calls.map((call: unknown[]) => call[1])).toEqual([
      { id: 'load-failed' },
      { id: 'load-failed' },
    ]);
  });

  it('reports an answer of the API to Rollbar once per message', () => {
    const error = new HttpError('cams grid fetch failed: 503', 503);

    handleQueryError(error);
    handleQueryError(error);

    expect(rollbarError).toHaveBeenCalledTimes(1);
    expect(rollbarError).toHaveBeenCalledWith(error);
  });

  it('does not report a dropped connection', () => {
    handleQueryError(new TypeError('Failed to fetch'));

    expect(toastError).toHaveBeenCalledTimes(1);
    expect(rollbarError).not.toHaveBeenCalled();
  });
});
