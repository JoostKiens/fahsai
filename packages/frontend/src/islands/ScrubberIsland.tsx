import { Scrubber } from '@/components/Scrubber/Scrubber';
import { SCRUBBER_MIN_HEIGHT_CLS } from '@/components/Scrubber/scrubberLayout';
import { IslandRoot } from './IslandRoot';

export function ScrubberIsland() {
  return (
    <IslandRoot
      name="Scrubber"
      fallback={
        <div
          className={`bg-zinc-900 border-t border-zinc-800 pointer-events-auto px-4 flex items-center justify-center ${SCRUBBER_MIN_HEIGHT_CLS}`}
        >
          <span className="text-zinc-500 text-[11px]">Timeline unavailable</span>
        </div>
      }
    >
      <Scrubber />
    </IslandRoot>
  );
}
