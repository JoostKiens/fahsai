import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useUIStore } from '../store/uiStore';
import { useTimeStore } from '../store/timeStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLatestDate } from './useLatestDate';

export function useUrlSync() {
  const mapCenter = useUIStore((s) => s.mapCenter);
  const mapZoom = useUIStore((s) => s.mapZoom);
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const setScrubberDay = useUIStore((s) => s.setScrubberDay);
  const { data: latestDateData } = useLatestDate();
  const hasInited = useRef(false);

  // Write URL on state changes (debounced 500 ms)
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      p.set('lat', mapCenter[1].toFixed(4));
      p.set('lng', mapCenter[0].toFixed(4));
      p.set('zoom', mapZoom.toFixed(2));
      p.set('date', selectedDate);
      history.replaceState(null, '', '?' + p.toString());
    }, 500);
    return () => clearTimeout(t);
  }, [mapCenter, mapZoom, selectedDate]);

  // Initialise scrubber date from URL once, after latestDate is known
  useEffect(() => {
    if (!latestDateData || hasInited.current) return;
    hasInited.current = true;

    const urlDate = new URLSearchParams(window.location.search).get('date');
    if (!urlDate || !/^\d{4}-\d{2}-\d{2}$/.test(urlDate)) return;

    const scrubberDays = useSettingsStore.getState().scrubberDays;
    const latestMs = new Date(latestDateData + 'T00:00:00Z').getTime();
    const oldestMs = latestMs - (scrubberDays - 1) * 86_400_000;
    const urlMs = new Date(urlDate + 'T00:00:00Z').getTime();
    if (!isFinite(urlMs)) return;

    if (urlMs >= oldestMs && urlMs <= latestMs) {
      const day = Math.round((latestMs - urlMs) / 86_400_000);
      setScrubberDay(scrubberDays - 1 - day);
    } else {
      setScrubberDay(urlMs < oldestMs ? 0 : scrubberDays - 1);
      toast('Date not available — showing the nearest available date instead.');
    }
  }, [latestDateData, setScrubberDay]);
}
