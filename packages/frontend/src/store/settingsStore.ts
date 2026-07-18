import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'th';

interface SettingsStore {
  scrubberDays: number;
  setScrubberDays: (days: number) => void;
  language: Language | null; // null = not yet explicitly chosen; first-visit browser detection used
  setLanguage: (lang: Language) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      scrubberDays: 120,
      setScrubberDays: (days) => set({ scrubberDays: days }),
      language: null,
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: 'taqm:settings',
      version: 3,
      migrate: (persistedState, version) => {
        let state = persistedState as Partial<SettingsStore>;
        if (version < 2) {
          state = { ...state, language: null };
        }
        if (version < 3) {
          // Pre-v3 state may still carry the old 120-day value. 120 is a valid
          // option again, so restore it instead of clamping to 90.
          if ((state.scrubberDays ?? 0) > 90) state = { ...state, scrubberDays: 120 };
        }
        return state as SettingsStore;
      },
    },
  ),
);
