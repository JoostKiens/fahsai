import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useTimeStore } from '@/store/timeStore';
import { selParamFromPending, selParamFromSelection } from '@/utils/selectionUrl';

export function useUrlSync() {
  const mapCenter = useUIStore((s) => s.mapCenter);
  const mapZoom = useUIStore((s) => s.mapZoom);
  const selectedDate = useTimeStore((s) => s.selectedDate);
  const latestDateResolved = useTimeStore((s) => s.latestDateResolved);
  const selectedPoint = useUIStore((s) => s.selectedPoint);
  const pendingSelection = useUIStore((s) => s.pendingSelection);

  // Selection param: prefer the resolved point; otherwise echo the still-hydrating
  // URL value so a copy mid-hydration keeps the link shareable.
  const selParam = selParamFromSelection(selectedPoint) ?? selParamFromPending(pendingSelection);

  // Reflect current map state + selected date + selection in the URL (debounced 500 ms).
  // Language is expressed by the path (/th/ vs /), not a query param.
  useEffect(() => {
    // Wait until the real latest date is known before writing the URL. Otherwise the optimistic
    // default (Bangkok-yesterday) gets stamped into ?date= and useLatestDate misreads its
    // own guess as a user-supplied future date, firing a spurious "date not available" toast.
    if (!latestDateResolved) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      p.set('lat', mapCenter[1].toFixed(4));
      p.set('lng', mapCenter[0].toFixed(4));
      p.set('zoom', mapZoom.toFixed(2));
      p.set('date', selectedDate);
      if (selParam) p.set('sel', selParam);
      history.replaceState(null, '', window.location.pathname + '?' + p.toString());
    }, 500);
    return () => clearTimeout(t);
  }, [mapCenter, mapZoom, selectedDate, selParam, latestDateResolved]);
}
