import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { MapView } from './components/Map/MapView';
import { UIOverlay } from './components/ui/UIOverlay';
import { Scrubber } from './components/ui/Scrubber/Scrubber';
import { Header } from './components/ui/Header/Header';
import { Sidebar } from './components/ui/Sidebar/Sidebar';
import { useDataNotifications } from './hooks/useDataNotifications';
import { useUrlSync } from './hooks/useUrlSync';
import { LatestDateProvider } from './providers/LatestDateProvider';

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
  return (
    <div className="flex flex-col h-screen">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="relative flex-1 overflow-hidden">
          <MapView />
          <UIOverlay />
        </div>
      </div>
      <Scrubber />
    </div>
  );
}

function App() {
  const isMobile = useIsMobile();
  return (
    <LatestDateProvider>
      <AppContent />
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
