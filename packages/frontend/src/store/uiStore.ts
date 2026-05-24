import { create } from 'zustand';
import { useSettingsStore } from './settingsStore';

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 — Bangkok / ICT

export interface SelectedPoint {
  lngLat: [number, number];
  fire?: {
    frp: number | null;
    confidence: string | null;
    countryId: string;
    detectedAt: string;
    daynight: string | null;
    satellite: string | null;
  };
  station?: {
    stationId: string;
    stationName: string;
    country: string | null;
    pm25: number;
    unit: string;
    measuredAt: string;
  };
  powerPlant?: {
    name: string;
    fuelType: string;
    capacityMw: number | null;
    owner: string | null;
    commissionedYear: number | null;
    country: string;
  };
}

interface UIStore {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  selectedPoint: SelectedPoint | null;
  setSelectedPoint: (point: SelectedPoint | null) => void;
  hintDismissed: boolean;
  dismissHint: () => void;
  scrubberDay: number; // 0 = oldest day in range, scrubberDays-1 = latestDate
  setScrubberDay: (day: number) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
  mapCenter: [number, number]; // [lng, lat]
  setMapCenter: (center: [number, number]) => void;
  mapZoom: number;
  setMapZoom: (zoom: number) => void;
  explainQuotaExceeded: boolean;
  setExplainQuotaExceeded: (v: boolean) => void;
  headerMenuOpen: boolean;
  setHeaderMenuOpen: (v: boolean) => void;
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
  // Use yesterday ICT (= timeStore's initial latestDate) so dayToDate(day, yesterdayICT)
  // produces exactly the URL date at first render — no off-by-one before the provider corrects.
  const yesterdayIctMs = Date.now() + ICT_OFFSET_MS - 86_400_000;
  const daysAgo = Math.round((yesterdayIctMs - urlMs) / 86_400_000);
  return Math.max(0, Math.min(scrubberDays - 1, scrubberDays - 1 - daysAgo));
}

export const useUIStore = create<UIStore>((set, get) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  selectedPoint: null,
  setSelectedPoint: (p) => set({ selectedPoint: p, hintDismissed: p ? true : get().hintDismissed }),
  hintDismissed: false,
  dismissHint: () => set({ hintDismissed: true }),
  scrubberDay: initialScrubberDayFromUrl(),
  setScrubberDay: (day) => set({ scrubberDay: day }),
  playing: false,
  setPlaying: (playing) => set({ playing }),
  mapCenter: [101.0, 15.5],
  setMapCenter: (center) => set({ mapCenter: center }),
  mapZoom: 5.5,
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
  explainQuotaExceeded: false,
  setExplainQuotaExceeded: (v) => set({ explainQuotaExceeded: v }),
  headerMenuOpen: false,
  setHeaderMenuOpen: (v) => set({ headerMenuOpen: v }),
  aboutOpen: false,
  setAboutOpen: (v) => set({ aboutOpen: v }),
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
}));

// day 0 = (days-1) days before latestDate, day (days-1) = latestDate.
export function dayToDate(day: number, latestDate: string, days = 30): string {
  const anchorMs = new Date(latestDate + 'T00:00:00Z').getTime();
  return new Date(anchorMs - (days - 1 - day) * 86_400_000).toISOString().slice(0, 10);
}
