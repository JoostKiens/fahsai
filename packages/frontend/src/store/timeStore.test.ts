import { describe, it, expect, beforeEach } from 'vitest';
import { useTimeStore, selectIsSettled } from './timeStore.js';

beforeEach(() => {
  useTimeStore.setState({
    latestDate: '2026-08-14',
    latestDateResolved: false,
    selectedDate: '2026-08-14',
  });
});

describe('timeStore', () => {
  it('starts with latestDateResolved false', () => {
    expect(useTimeStore.getState().latestDateResolved).toBe(false);
  });

  it('setLatestDate flips latestDateResolved to true and updates latestDate atomically', () => {
    useTimeStore.getState().setLatestDate('2026-08-13');
    expect(useTimeStore.getState().latestDate).toBe('2026-08-13');
    expect(useTimeStore.getState().latestDateResolved).toBe(true);
  });

  it('setDate updates only selectedDate', () => {
    useTimeStore.getState().setDate('2026-08-10');
    const state = useTimeStore.getState();
    expect(state.selectedDate).toBe('2026-08-10');
    expect(state.latestDate).toBe('2026-08-14');
    expect(state.latestDateResolved).toBe(false);
  });
});

describe('selectIsSettled', () => {
  it('is false before latestDateResolved, even if selectedDate <= latestDate', () => {
    useTimeStore.setState({
      latestDate: '2026-08-14',
      latestDateResolved: false,
      selectedDate: '2026-08-14',
    });
    expect(selectIsSettled(useTimeStore.getState())).toBe(false);
  });

  it('is false once resolved if the optimistic guess overshot the real latest date', () => {
    // The real scenario this session: selectedDate started as an optimistic "yesterday"
    // guess (2026-08-14) that turned out later than the real latest complete date
    // (2026-08-13) once useLatestDate resolved, before Scrubber corrects selectedDate.
    useTimeStore.setState({
      latestDate: '2026-08-13',
      latestDateResolved: true,
      selectedDate: '2026-08-14',
    });
    expect(selectIsSettled(useTimeStore.getState())).toBe(false);
  });

  it('is true once resolved and selectedDate has been corrected to the real latest date', () => {
    useTimeStore.setState({
      latestDate: '2026-08-13',
      latestDateResolved: true,
      selectedDate: '2026-08-13',
    });
    expect(selectIsSettled(useTimeStore.getState())).toBe(true);
  });
});
