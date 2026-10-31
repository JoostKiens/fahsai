import { describe, it, expect, beforeEach, vi } from 'vitest';

// A server-rendered island hydrates against the stores' *initial* state (Zustand uses
// getInitialState() as the server snapshot), which is what the server rendered with. So the initial
// state must be the same defaults everywhere; what the page URL asks for is applied right after
// the store is created. These tests load fresh store modules with a URL set, as a browser would.
const MS_PER_DAY = 86_400_000;
const ICT_OFFSET_MS = 7 * 3_600_000;

function ictDateDaysAgo(days: number): string {
  return new Date(Date.now() + ICT_OFFSET_MS - days * MS_PER_DAY).toISOString().slice(0, 10);
}

async function loadStores(search: string) {
  vi.resetModules();
  window.history.replaceState(null, '', `/${search}`);
  const ui = await import('./uiStore');
  const time = await import('./timeStore');
  return { ui: ui.useUIStore, time: time.useTimeStore, yesterday: time.yesterdayICT };
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('stores and the page URL', () => {
  it('start from the same defaults whatever the URL says', async () => {
    const { ui, time, yesterday } = await loadStores(
      `?date=${ictDateDaysAgo(3)}&sel=station:6123215`,
    );

    expect(time.getInitialState().selectedDate).toBe(yesterday);
    expect(ui.getInitialState().scrubberDay).toBe(119);
    expect(ui.getInitialState().pendingSelection).toBeNull();
  });

  it('apply the URL right after creation, so client-only islands see it from their first render', async () => {
    const { ui, time } = await loadStores(`?date=${ictDateDaysAgo(3)}&sel=station:6123215`);

    expect(time.getState().selectedDate).toBe(ictDateDaysAgo(3));
    expect(ui.getState().scrubberDay).toBe(117);
    expect(ui.getState().pendingSelection).toEqual({ kind: 'station', id: '6123215' });
  });

  it('keep the defaults when the URL has no date or selection', async () => {
    const { ui, time, yesterday } = await loadStores('');

    expect(time.getState().selectedDate).toBe(yesterday);
    expect(ui.getState().scrubberDay).toBe(119);
    expect(ui.getState().pendingSelection).toBeNull();
  });
});
