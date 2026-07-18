import { create } from 'zustand';
import { MS_PER_DAY, ICT_OFFSET_MS } from '@thailand-aq/consts';

interface TimeStore {
  latestDate: string; // always a valid YYYY-MM-DD; starts as yesterday ICT, updated by useLatestDate
  latestDateResolved: boolean; // false until useLatestDate receives the real value from the API
  selectedDate: string; // YYYY-MM-DD
  setLatestDate: (date: string) => void;
  setDate: (date: string) => void;
}

export const yesterdayICT = new Date(Date.now() + ICT_OFFSET_MS - MS_PER_DAY)
  .toISOString()
  .slice(0, 10);

function initialDateFromUrl(): string {
  const raw = new URLSearchParams(window.location.search).get('date');
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return yesterdayICT;
  const ms = new Date(raw + 'T00:00:00Z').getTime();
  const nowMs = Date.now() + ICT_OFFSET_MS;
  if (!isFinite(ms) || ms > nowMs || nowMs - ms > 90 * MS_PER_DAY) return yesterdayICT;
  return raw;
}

const initialDate = initialDateFromUrl();

export const useTimeStore = create<TimeStore>((set) => ({
  latestDate: yesterdayICT,
  latestDateResolved: false,
  selectedDate: initialDate,
  setLatestDate: (date) => set({ latestDate: date, latestDateResolved: true }),
  setDate: (date) => set({ selectedDate: date }),
}));

// True once the real latestDate is known from the API AND selectedDate is within the valid range.
// Toasts and other "settled" UI should gate on this selector.
export const selectIsSettled = (s: TimeStore) =>
  s.latestDateResolved && s.selectedDate <= s.latestDate;
