import { Scrubber } from '@/components/Scrubber/Scrubber';
import { SCRUBBER_BAR_CLS } from '@/components/Scrubber/scrubberLayout';
import { IslandRoot } from './IslandRoot';

export function ScrubberIsland() {
  return (
    <IslandRoot
      name="Scrubber"
      fallback={
        <div
          className={`${SCRUBBER_BAR_CLS} pointer-events-auto px-4 flex items-center justify-center`}
        >
          <span className="text-zinc-500 text-[11px]">Timeline unavailable</span>
        </div>
      }
    >
      <Scrubber />
    </IslandRoot>
  );
}
