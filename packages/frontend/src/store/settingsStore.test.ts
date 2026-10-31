import { describe, it, expect, beforeEach, vi } from 'vitest';

async function loadStoreWith(saved?: unknown) {
  vi.resetModules();
  localStorage.clear();
  if (saved !== undefined) localStorage.setItem('taqm:settings', JSON.stringify(saved));
  const { useSettingsStore } = await import('./settingsStore');
  return useSettingsStore;
}

function savedSettings() {
  return JSON.parse(localStorage.getItem('taqm:settings') ?? 'null') as {
    state: Record<string, unknown>;
    version: number;
  };
}

beforeEach(() => localStorage.clear());

describe('settingsStore', () => {
  it('drops the language an older version saved, keeping the rest', async () => {
    const store = await loadStoreWith({ state: { scrubberDays: 60, language: 'th' }, version: 3 });

    expect(store.getState().scrubberDays).toBe(60);
    expect('language' in store.getState()).toBe(false);
    expect(savedSettings().state).toEqual({ scrubberDays: 60 });
    expect(savedSettings().version).toBe(4);
  });

  it('still lifts a 120-day range saved before 120 was a valid option again', async () => {
    const store = await loadStoreWith({ state: { scrubberDays: 120, language: null }, version: 2 });

    expect(store.getState().scrubberDays).toBe(120);
  });

  it('keeps a shorter range saved by any version', async () => {
    const store = await loadStoreWith({ state: { scrubberDays: 30, language: 'en' }, version: 1 });

    expect(store.getState().scrubberDays).toBe(30);
  });

  it('keeps the default range when an old blob never had one', async () => {
    const store = await loadStoreWith({ state: { language: 'th' }, version: 3 });

    expect(store.getState().scrubberDays).toBe(120);
  });

  it('starts with the 120-day range and saves only that', async () => {
    const store = await loadStoreWith();

    store.getState().setScrubberDays(90);

    expect(savedSettings().state).toEqual({ scrubberDays: 90 });
  });
});
