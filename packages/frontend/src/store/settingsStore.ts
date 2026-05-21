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
      scrubberDays: 30,
      setScrubberDays: (days) => set({ scrubberDays: days }),
      language: null,
      setLanguage: (lang) => set({ language: lang }),
    }),
    {
      name: 'taqm:settings',
      version: 2,
      migrate: (persistedState, version) => {
        if (version === 1) {
          return { ...(persistedState as object), language: null };
        }
        return persistedState as SettingsStore;
      },
    },
  ),
);
