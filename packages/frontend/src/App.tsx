import { Toaster } from 'sonner';
import { MapView } from './components/Map/MapView';
import { UIOverlay } from './components/ui/UIOverlay';
import { Scrubber } from './components/ui/Scrubber/Scrubber';
import { Header } from './components/ui/Header/Header';
import { Sidebar } from './components/ui/Sidebar/Sidebar';
import { useDataNotifications } from './hooks/useDataNotifications';
import { useUrlSync } from './hooks/useUrlSync';
import { LatestDateProvider } from './providers/LatestDateProvider';

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
  return (
    <LatestDateProvider>
      <AppContent />
      <Toaster position="bottom-right" offset={{ bottom: 82, right: 12 }} theme="light" />
    </LatestDateProvider>
  );
}

export default App;
