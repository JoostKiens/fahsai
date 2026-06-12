import { SidebarReopenButton } from './Sidebar';
import { SidebarToggleFAB } from './SidebarToggleFAB';
import { InfoPanel } from './InfoPanel';
import { HintPill } from './HintPill';

export function UIOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 font-sans">
      <SidebarReopenButton />
      <SidebarToggleFAB />
      <InfoPanel />
      <HintPill />
    </div>
  );
}
