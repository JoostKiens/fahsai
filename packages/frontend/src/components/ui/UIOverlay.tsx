import { SidebarReopenButton } from './Sidebar/Sidebar';
import { SidebarToggleFAB } from './SidebarToggleFAB/SidebarToggleFAB';
import { InfoPanel } from './InfoPanel/InfoPanel';

export function UIOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 font-sans">
      <SidebarReopenButton />
      <SidebarToggleFAB />
      <InfoPanel />
    </div>
  );
}
