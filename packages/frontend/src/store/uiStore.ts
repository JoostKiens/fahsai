import { create } from 'zustand';
import { MS_PER_DAY, ICT_OFFSET_MS } from '@thailand-aq/consts';
import { useSettingsStore } from './settingsStore';
import { parsePendingSelectionFromSearch } from '@/utils/selectionUrl';

export interface SelectedPoint {
  lngLat: [number, number];
  fire?: {
    id: number;
    frp: number | null;
    confidence: string | null;
    detectedAt: string;
    daynight: string | null;
  };
  station?: {
    stationId: string;
    stationName: string;
    country: string | null;
    pm25: number;
    measuredAt: string;
  };
  powerPlant?: {
    id: number;
    name: string;
    fuelType: string;
    capacityMw: number | null;
    owner: string | null;
    commissionedYear: number | null;
    country: string;
  };
}

export type PendingSelectionKind = 'station' | 'fire' | 'plant';

export interface PendingSelection {
  kind: PendingSelectionKind;
  id: string;
}

interface UIStore {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  selectedPoint: SelectedPoint | null;
  setSelectedPoint: (point: SelectedPoint | null) => void;
  pendingSelection: PendingSelection | null;
  setPendingSelection: (p: PendingSelection | null) => void;
  hintDismissed: boolean;
  dismissHint: () => void;
  scrubberDay: number; // 0 = oldest day in range, scrubberDays-1 = latestDate
  setScrubberDay: (day: number) => void;
  sessionScrubberDays: number | null; // session-only override for scrubberDays (not persisted)
  setSessionScrubberDays: (days: number | null) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  mapCenter: [number, number]; // [lng, lat]
  setMapCenter: (center: [number, number]) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
  explainRateLimit: { type: string; resetAtMs: number } | null;
  setExplainRateLimit: (v: { type: string; resetAtMs: number } | null) => void;
  aboutOpen: boolean;
  setAboutOpen: (v: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

function initialScrubberDayFromUrl(): number {
  const scrubberDays = useSettingsStore.getState().scrubberDays;
  const raw = new URLSearchParams(window.location.search).get('date');
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return scrubberDays - 1;
  const urlMs = new Date(raw + 'T00:00:00Z').getTime();
  if (!isFinite(urlMs)) return scrubberDays - 1;
  // Use midnight UTC of yesterdayICT so the diff against urlMs (also midnight UTC) is always an
  // exact multiple of 86 400 000. Using the raw timestamp (Date.now() - 17h) produces a
  // fractional quotient that Math.round gets wrong for any current UTC time past noon.
  const yesterdayIctDate = new Date(Date.now() + ICT_OFFSET_MS - MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
  const anchorMs = new Date(yesterdayIctDate + 'T00:00:00Z').getTime();
  const daysAgo = (anchorMs - urlMs) / MS_PER_DAY;
  return Math.max(0, Math.min(scrubberDays - 1, scrubberDays - 1 - daysAgo));
}

export const useUIStore = create<UIStore>((set, get) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  selectedPoint: null,
  // Any explicit selection (or dismissal) supersedes a not-yet-resolved URL hydration.
  setSelectedPoint: (p) =>
    set({
      selectedPoint: p,
      pendingSelection: null,
      hintDismissed: p ? true : get().hintDismissed,
    }),
  pendingSelection: parsePendingSelectionFromSearch(window.location.search),
  setPendingSelection: (p) => set({ pendingSelection: p }),
  hintDismissed: false,
  dismissHint: () => set({ hintDismissed: true }),
  scrubberDay: initialScrubberDayFromUrl(),
  setScrubberDay: (day) => set({ scrubberDay: day }),
  sessionScrubberDays: null,
  setSessionScrubberDays: (days) => set({ sessionScrubberDays: days }),
  playing: false,
  setPlaying: (playing) => set({ playing }),
  mapCenter: [101.0, 15.5],
  setMapCenter: (center) => set({ mapCenter: center }),
  mapZoom: 5.5,
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
  explainRateLimit: null,
  setExplainRateLimit: (v) => set({ explainRateLimit: v }),
  aboutOpen: false,
  setAboutOpen: (v) => set({ aboutOpen: v }),
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
}));

// day 0 = (days-1) days before latestDate, day (days-1) = latestDate.
export function dayToDate(day: number, latestDate: string, days = 30): string {
  const anchorMs = new Date(latestDate + 'T00:00:00Z').getTime();
  return new Date(anchorMs - (days - 1 - day) * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Returns the session override if set, otherwise the persisted user preference. */
export function useEffectiveScrubberDays(): number {
  const session = useUIStore((s) => s.sessionScrubberDays);
  const stored = useSettingsStore((s) => s.scrubberDays);
  return session ?? stored;
}

/** Non-hook version for use inside callbacks and intervals. */
export function getEffectiveScrubberDays(): number {
  return useUIStore.getState().sessionScrubberDays ?? useSettingsStore.getState().scrubberDays;
}
