import { useEffect, useState } from 'react';
import { MOBILE_MIN_WIDTH_PX, PHONE_MEDIA_QUERY } from '@/utils/mapView';

/**
 * True below Tailwind's md breakpoint, where the mobile layout and bottom sheets show. The width is
 * the one the map's start view and its placeholder split on (utils/mapView.ts).
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_MIN_WIDTH_PX);
  useEffect(() => {
    const mql = window.matchMedia(PHONE_MEDIA_QUERY);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}
