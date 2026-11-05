import { Header } from '@/components/Header/Header';
import type { SearchTarget } from '@/components/Header/utils.search-target';
import type { Language } from '@/i18n-instance';
import { ServerIslandRoot } from './ServerIslandRoot';

interface Props {
  lang: Language;
  /** 'page' on a page without the map: see Header */
  context?: 'map' | 'page';
  stationsDate?: string;
  cities?: SearchTarget[];
}

export function HeaderIsland({ lang, context = 'map', stationsDate, cities }: Props) {
  return (
    <ServerIslandRoot
      lang={lang}
      name="Header"
      fallback={
        <header className="h-12 shrink-0 flex items-center px-4 border-b border-zinc-800 bg-zinc-900 z-20">
          <span className="text-[13px] font-semibold text-zinc-100">Fahsai</span>
        </header>
      }
    >
      <Header context={context} stationsDate={stationsDate} cities={cities} />
    </ServerIslandRoot>
  );
}
