import { create } from 'zustand';

interface TimeStore {
  latestDate: string; // always a valid YYYY-MM-DD; starts as yesterday ICT, updated by LatestDateProvider
  latestDateResolved: boolean; // false until LatestDateProvider receives the real value from the API
  selectedDate: string; // YYYY-MM-DD
  rangeMode: boolean;
  rangeStart: string;
  rangeEnd: string;
  setLatestDate: (date: string) => void;
  setDate: (date: string) => void;
  setRange: (start: string, end: string) => void;
}

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 — must match uiStore
export const yesterdayICT = new Date(Date.now() + ICT_OFFSET_MS - 86_400_000)
  .toISOString()
  .slice(0, 10);

function initialDateFromUrl(): string {
  const raw = new URLSearchParams(window.location.search).get('date');
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return yesterdayICT;
  const ms = new Date(raw + 'T00:00:00Z').getTime();
  const nowMs = Date.now() + ICT_OFFSET_MS;
  if (!isFinite(ms) || ms > nowMs || nowMs - ms > 120 * 86_400_000) return yesterdayICT;
  return raw;
}

const initialDate = initialDateFromUrl();

export const useTimeStore = create<TimeStore>((set) => ({
  latestDate: yesterdayICT,
  latestDateResolved: false,
  selectedDate: initialDate,
  rangeMode: false,
  rangeStart: initialDate,
  rangeEnd: initialDate,
  setLatestDate: (date) => set({ latestDate: date, latestDateResolved: true }),
  setDate: (date) => set({ selectedDate: date }),
  setRange: (start, end) => set({ rangeMode: true, rangeStart: start, rangeEnd: end }),
}));

// True once the real latestDate is known from the API AND selectedDate is within the valid range.
// Toasts and other "settled" UI should gate on this selector.
export const selectIsSettled = (s: TimeStore) =>
  s.latestDateResolved && s.selectedDate <= s.latestDate;
