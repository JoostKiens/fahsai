import { Scrubber } from '@/components/Scrubber/Scrubber';
import { SCRUBBER_BAR_CLS } from '@/components/Scrubber/scrubberLayout';
import type { ScrubberData } from '@/lib/scrubberData';
import type { Language } from '@/store/settingsStore';
import { ServerIslandRoot } from './ServerIslandRoot';

export function ScrubberIsland({ lang, data }: { lang: Language; data: ScrubberData | null }) {
  return (
    <ServerIslandRoot
      lang={lang}
      name="Scrubber"
      fallback={
        <div
          className={`${SCRUBBER_BAR_CLS} pointer-events-auto px-4 flex items-center justify-center`}
        >
          <span className="text-zinc-500 text-[11px]">Timeline unavailable</span>
        </div>
      }
    >
      <Scrubber initialData={data} />
    </ServerIslandRoot>
  );
}
