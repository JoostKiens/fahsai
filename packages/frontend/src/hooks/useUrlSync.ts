import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { useTimeStore } from '../store/timeStore';

export function useUrlSync() {
  const mapCenter = useUIStore((s) => s.mapCenter);
  const mapZoom = useUIStore((s) => s.mapZoom);
  const selectedDate = useTimeStore((s) => s.selectedDate);

  // Reflect current map state + selected date in the URL (debounced 500 ms).
  // Language is expressed by the path (/th/ vs /), not a query param.
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      p.set('lat', mapCenter[1].toFixed(4));
      p.set('lng', mapCenter[0].toFixed(4));
      p.set('zoom', mapZoom.toFixed(2));
      p.set('date', selectedDate);
      history.replaceState(null, '', window.location.pathname + '?' + p.toString());
    }, 500);
    return () => clearTimeout(t);
  }, [mapCenter, mapZoom, selectedDate]);
}
