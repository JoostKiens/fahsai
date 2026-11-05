import { AqiBadge } from '@/components/InfoPanel/AqiBadge';
import type { Language } from '@/i18n-instance';
import { ServerIslandRoot } from './ServerIslandRoot';

/** The city's figure as the map's badge. Rendered on the server only: it has nothing to hydrate. */
export function CityHeadlineIsland({
  lang,
  value,
  category,
}: {
  lang: Language;
  value: number;
  category: string;
}) {
  return (
    <ServerIslandRoot lang={lang} name="CityHeadline" fallback={null}>
      <AqiBadge value={value} category={category} />
    </ServerIslandRoot>
  );
}
