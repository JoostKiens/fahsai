import { SidebarReopenButton } from './Sidebar';
import { SidebarToggleFAB } from './SidebarToggleFAB/SidebarToggleFAB';
import { InfoPanel } from './InfoPanel/InfoPanel';
import { HintPill } from './HintPill/HintPill';
import { ErrorBoundary } from './ErrorBoundary';

export function UIOverlay() {
  return (
    <div className="absolute inset-0 pointer-events-none z-10 font-sans">
      <SidebarReopenButton />
      <SidebarToggleFAB />
      <ErrorBoundary
        name="InfoPanel"
        fallback={
          <div className="hidden md:flex items-center justify-center absolute top-3 right-3 w-[260px] h-20 bg-zinc-900 border border-zinc-700/60 rounded-lg z-20 pointer-events-auto shadow-2xl">
            <span className="text-zinc-500 text-[11px]">Panel unavailable</span>
          </div>
        }
      >
        <InfoPanel />
      </ErrorBoundary>
      <HintPill />
    </div>
  );
}
