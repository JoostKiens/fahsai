import { lazy, Suspense } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Toaster } from 'sonner';
import { useTranslation } from 'react-i18next';
import { UIOverlay } from '@/components/UIOverlay';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  useDataNotifications,
  useUrlSync,
  useSelectionHydration,
  useLatestDate,
  useIsMobile,
} from '@/hooks';
import { IslandRoot } from './IslandRoot';

const MapView = lazy(() =>
  import('@/components/Map/MapView').then((m) => ({ default: m.MapView })),
);

// The map, its overlay, and everything that is page-wide rather than tied to one region: the URL
// and date sync, the data toasts and the analytics scripts.
function MapRegion() {
  const { t } = useTranslation();
  useLatestDate();
  useDataNotifications();
  useUrlSync();
  useSelectionHydration();
  return (
    <main aria-label={t('map.ariaLabel')} className="relative flex-1 overflow-hidden">
      <ErrorBoundary
        name="MapView"
        fallback={
          <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
            <span className="text-zinc-500 text-sm">Map unavailable</span>
          </div>
        }
      >
        <Suspense fallback={<div className="w-full h-full bg-zinc-950" />}>
          <MapView />
        </Suspense>
      </ErrorBoundary>
      <UIOverlay />
    </main>
  );
}

export function MapIsland() {
  const isMobile = useIsMobile();
  return (
    <IslandRoot
      name="Map"
      fallback={
        <main className="relative flex-1 overflow-hidden bg-zinc-950 flex items-center justify-center">
          <span className="text-zinc-500 text-sm">Map unavailable</span>
        </main>
      }
    >
      <MapRegion />
      <SpeedInsights />
      <Analytics />
      {isMobile ? (
        <Toaster
          position="top-center"
          offset={{ top: 64 }}
          mobileOffset={{ top: 64 }}
          theme="light"
        />
      ) : (
        <Toaster position="bottom-right" offset={{ bottom: 82, right: 12 }} theme="light" />
      )}
    </IslandRoot>
  );
}
