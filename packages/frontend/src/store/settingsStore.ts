import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  scrubberDays: number;
  setScrubberDays: (days: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      scrubberDays: 120,
      setScrubberDays: (days) => set({ scrubberDays: days }),
    }),
    {
      name: 'taqm:settings',
      version: 4,
      migrate: (persistedState, version) => {
        let state = persistedState as Partial<SettingsStore>;
        if (version < 3) {
          // Pre-v3 state may still carry the old 120-day value. 120 is a valid
          // option again, so restore it instead of clamping to 90.
          if ((state.scrubberDays ?? 0) > 90) state = { ...state, scrubberDays: 120 };
        }
        if (version < 4) {
          // The language preference moved to a cookie that only the language switch sets (see
          // CONTEXT.md). The saved value mixed explicit choices with mere visits to a Thai page,
          // so it is dropped, not copied: keep only what is still stored here.
          state = state.scrubberDays === undefined ? {} : { scrubberDays: state.scrubberDays };
        }
        return state as SettingsStore;
      },
    },
  ),
);
