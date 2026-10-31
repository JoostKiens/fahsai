import { Sidebar } from '@/components/Sidebar';
import { IslandRoot } from './IslandRoot';

export function SidebarIsland() {
  return (
    <IslandRoot
      name="Sidebar"
      fallback={
        <aside className="hidden md:flex shrink-0 z-20 w-65 bg-zinc-900 border-r border-zinc-800 items-center justify-center">
          <span className="text-zinc-500 text-[11px] text-center px-4">Controls unavailable</span>
        </aside>
      }
    >
      <Sidebar />
    </IslandRoot>
  );
}
