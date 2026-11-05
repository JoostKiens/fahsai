import { PmBarChart, type PmBarDay } from '@/components/InfoPanel/PmBarChart';
import type { Language } from '@/i18n-instance';
import { ServerIslandRoot } from './ServerIslandRoot';

/** The city page's 7-day chart: server-rendered, hydrated for the value tooltip. */
export function CityChartIsland({
  lang,
  days,
  barHeight,
}: {
  lang: Language;
  days: PmBarDay[];
  barHeight: number;
}) {
  return (
    <ServerIslandRoot lang={lang} name="CityChart" fallback={null}>
      <PmBarChart days={days} barHeight={barHeight} />
    </ServerIslandRoot>
  );
}
