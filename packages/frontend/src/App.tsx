import { useEffect, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Toaster } from 'sonner';
import { MapView } from '@/components/Map/MapView';
import { UIOverlay } from '@/components/UIOverlay';
import { Scrubber } from '@/components/Scrubber/Scrubber';
import { Header } from '@/components/Header/Header';
import { Sidebar } from '@/components/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useDataNotifications, useUrlSync, useSelectionHydration } from '@/hooks';
import { LatestDateProvider } from '@/providers/LatestDateProvider';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

function AppContent() {
  useDataNotifications();
  useUrlSync();
  useSelectionHydration();
  return (
    <div className="flex flex-col h-full">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <ErrorBoundary
          name="Sidebar"
          fallback={
            <aside className="hidden md:flex shrink-0 z-20 w-65 bg-zinc-900 border-r border-zinc-800 items-center justify-center">
              <span className="text-zinc-500 text-[11px] text-center px-4">
                Controls unavailable
              </span>
            </aside>
          }
        >
          <Sidebar />
        </ErrorBoundary>
        <div className="relative flex-1 overflow-hidden">
          <ErrorBoundary
            name="MapView"
            fallback={
              <div className="w-full h-full bg-zinc-950 flex items-center justify-center">
                <span className="text-zinc-500 text-sm">Map unavailable</span>
              </div>
            }
          >
            <MapView />
          </ErrorBoundary>
          <UIOverlay />
        </div>
      </div>
      <ErrorBoundary
        name="Scrubber"
        fallback={
          <div className="bg-zinc-900 border-t border-zinc-800 pointer-events-auto px-4 md:h-13 flex items-center justify-center">
            <span className="text-zinc-500 text-[11px]">Timeline unavailable</span>
          </div>
        }
      >
        <Scrubber />
      </ErrorBoundary>
    </div>
  );
}

function App() {
  const isMobile = useIsMobile();
  return (
    <LatestDateProvider>
      <AppContent />
      <SpeedInsights />
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
    </LatestDateProvider>
  );
}

export default App;
