import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  scrubberDays: number; // total days shown in the scrubber (30 | 60 | 90 | 120)
  setScrubberDays: (days: number) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      scrubberDays: 30,
      setScrubberDays: (days) => set({ scrubberDays: days }),
    }),
    {
      name: 'taqm:settings',
      version: 1,
    },
  ),
);
