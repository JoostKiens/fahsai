import { Scrubber } from '@/components/Scrubber/Scrubber';
import { IslandRoot } from './IslandRoot';

export function ScrubberIsland() {
  return (
    <IslandRoot
      name="Scrubber"
      fallback={
        <div className="bg-zinc-900 border-t border-zinc-800 pointer-events-auto px-4 md:h-13 flex items-center justify-center">
          <span className="text-zinc-500 text-[11px]">Timeline unavailable</span>
        </div>
      }
    >
      <Scrubber />
    </IslandRoot>
  );
}
