import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useLatestDate } from '../hooks/useLatestDate';
import { useTimeStore } from '../store/timeStore';
import { useUIStore } from '../store/uiStore';
import { useSettingsStore } from '../store/settingsStore';

const MAX_DAYS = 90;

/**
 * Fetches the latest complete date from the API and pushes it into the time store.
 * Also does the one-time initialisation of the scrubber position from the URL date param,
 * deferred until the real latestDate is known so the range boundaries are correct.
 */
export function LatestDateProvider({ children }: { children: React.ReactNode }) {
  const { data: latestDate } = useLatestDate();
  const setLatestDate = useTimeStore((s) => s.setLatestDate);
  const setScrubberDay = useUIStore((s) => s.setScrubberDay);
  const setSessionScrubberDays = useUIStore((s) => s.setSessionScrubberDays);
  const hasInited = useRef(false);

  useEffect(() => {
    if (!latestDate) return;

    setLatestDate(latestDate);

    if (hasInited.current) return;
    hasInited.current = true;

    const urlDate = new URLSearchParams(window.location.search).get('date');
    if (!urlDate || !/^\d{4}-\d{2}-\d{2}$/.test(urlDate)) return;

    const scrubberDays = useSettingsStore.getState().scrubberDays;
    const latestMs = new Date(latestDate + 'T00:00:00Z').getTime();
    const oldestMs = latestMs - (scrubberDays - 1) * 86_400_000;
    const oldest90Ms = latestMs - (MAX_DAYS - 1) * 86_400_000;
    const urlMs = new Date(urlDate + 'T00:00:00Z').getTime();
    if (!isFinite(urlMs)) return;

    if (urlMs >= oldestMs && urlMs <= latestMs) {
      const day = Math.round((latestMs - urlMs) / 86_400_000);
      setScrubberDay(scrubberDays - 1 - day);
    } else if (urlMs >= oldest90Ms && urlMs <= latestMs) {
      // Within 90 days but outside user's current window — expand for this session only.
      setSessionScrubberDays(MAX_DAYS);
      const daysBack = Math.round((latestMs - urlMs) / 86_400_000);
      setScrubberDay(MAX_DAYS - 1 - daysBack);
    } else {
      setScrubberDay(urlMs < oldest90Ms ? 0 : scrubberDays - 1);
      toast('Date not available — showing the nearest available date instead.');
    }
  }, [latestDate, setLatestDate, setScrubberDay, setSessionScrubberDays]);

  return <>{children}</>;
}
