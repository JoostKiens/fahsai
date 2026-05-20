import { create } from 'zustand';

interface TimeStore {
  selectedDate: string; // YYYY-MM-DD
  rangeMode: boolean;
  rangeStart: string;
  rangeEnd: string;
  setDate: (date: string) => void;
  setRange: (start: string, end: string) => void;
}

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 — must match uiStore
const yesterday = new Date(Date.now() + ICT_OFFSET_MS - 86_400_000).toISOString().slice(0, 10);

function initialDateFromUrl(): string {
  const raw = new URLSearchParams(window.location.search).get('date');
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return yesterday;
  const ms = new Date(raw + 'T00:00:00Z').getTime();
  // Reject future dates and dates older than the maximum scrubber range (120 days)
  const nowMs = Date.now() + ICT_OFFSET_MS;
  if (!isFinite(ms) || ms > nowMs || nowMs - ms > 120 * 86_400_000) return yesterday;
  return raw;
}

const initialDate = initialDateFromUrl();

export const useTimeStore = create<TimeStore>((set) => ({
  selectedDate: initialDate,
  rangeMode: false,
  rangeStart: initialDate,
  rangeEnd: initialDate,
  setDate: (date) => set({ selectedDate: date }),
  setRange: (start, end) => set({ rangeMode: true, rangeStart: start, rangeEnd: end }),
}));
