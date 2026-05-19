import { Toaster } from 'sonner';
import { MapView } from './components/Map/MapView';
import { UIOverlay } from './components/ui/UIOverlay';
import { Scrubber } from './components/ui/Scrubber/Scrubber';
import { Sidebar } from './components/ui/Sidebar/Sidebar';
import { useDataNotifications } from './hooks/useDataNotifications';

function AppContent() {
  useDataNotifications();
  return (
    <div className="flex flex-col h-screen">
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
    <>
      <AppContent />
      <Toaster position="bottom-right" offset={{ bottom: 82, right: 12 }} theme="light" />
    </>
  );
}

export default App;
