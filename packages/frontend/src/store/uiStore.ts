import { create } from 'zustand';

export interface SelectedPoint {
  lngLat: [number, number];
  fire?: {
    frp: number | null;
    confidence: string | null;
    countryId: string;
    detectedAt: string;
    daynight: string | null;
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
  scrubberDay: number; // 0 = 30 days ago, 29 = yesterday
  setScrubberDay: (day: number) => void;
  playing: boolean;
  setPlaying: (playing: boolean) => void;
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

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  selectedPoint: null,
  setSelectedPoint: (point) => set({ selectedPoint: point }),
  scrubberDay: 29,
  setScrubberDay: (day) => set({ scrubberDay: day }),
  playing: false,
  setPlaying: (playing) => set({ playing }),
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

const ICT_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 — Bangkok / ICT

// day 0 = 29 days before latestDate, day 29 = latestDate.
// When latestDate is unknown (loading), falls back to yesterday ICT.
export function dayToDate(day: number, latestDate?: string): string {
  if (latestDate) {
    const anchorMs = new Date(latestDate + 'T00:00:00Z').getTime();
    return new Date(anchorMs - (29 - day) * 86_400_000).toISOString().slice(0, 10);
  }
  const todayIctMs = Date.now() + ICT_OFFSET_MS;
  const d = new Date(todayIctMs - (30 - day) * 86_400_000);
  return d.toISOString().slice(0, 10);
}
