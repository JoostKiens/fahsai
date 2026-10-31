import { Header } from '@/components/Header/Header';
import type { Language } from '@/store/settingsStore';
import { ServerIslandRoot } from './ServerIslandRoot';

export function HeaderIsland({ lang }: { lang: Language }) {
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
      <Header />
    </ServerIslandRoot>
  );
}
