import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../store/uiStore';
import { useTimeStore } from '../store/timeStore';

export function useUrlSync() {
  const { i18n } = useTranslation();
  const mapCenter = useUIStore((s) => s.mapCenter);
  const mapZoom = useUIStore((s) => s.mapZoom);
  const selectedDate = useTimeStore((s) => s.selectedDate);

  // Reflect current map state, selected date, and language in the URL (debounced 500 ms).
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      p.set('lat', mapCenter[1].toFixed(4));
      p.set('lng', mapCenter[0].toFixed(4));
      p.set('zoom', mapZoom.toFixed(2));
      p.set('date', selectedDate);
      p.set('lang', i18n.language);
      history.replaceState(null, '', '?' + p.toString());
    }, 500);
    return () => clearTimeout(t);
  }, [mapCenter, mapZoom, selectedDate, i18n.language]);
}
