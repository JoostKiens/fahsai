import type { Language } from '@/i18n-instance';
import { searchWithoutLang } from '@/lib/langParam';

const CITY_PAGE = /^\/city(\/[a-z0-9-]+)?\/?$/;
// the only pages a language switch can ask for: what `equivalentPath` can return
const SWITCH_TARGET = /^\/(th\/|city(\/[a-z0-9-]+)?\/?)$/;

export function isSwitchTarget(path: string): boolean {
  return SWITCH_TARGET.test(path);
}

/**
 * The page in `lang` that is the equivalent of `pathname`, for a page that is not the map; null for
 * the map pages, which the redirect at `/` already handles.
 */
export function equivalentPath(lang: Language, pathname: string): string | null {
  if (!CITY_PAGE.test(pathname)) return null;
  // TODO(JOO-101): return `/th${pathname}` once the Thai city pages exist
  return lang === 'th' ? '/th/' : pathname;
}

/**
 * Whether choosing `lang` does anything. On a map page, choosing the language the page is in does
 * not. A city page is English whatever the stored preference is, so choosing English there still
 * records it: someone with Thai stored can then leave Thai behind.
 */
export function isSwitch(lang: Language, pageLang: Language, pathname: string): boolean {
  return lang !== pageLang || equivalentPath(lang, pathname) !== null;
}

/**
 * Where the language switch sends the browser: the redirect at `/`, which stores the choice and
 * lands on the page in that language. The rest of the query (map position, date, selection) goes
 * along; the redirect keeps it. On a page that is not the map, `to` names the equivalent page.
 */
export function languageSwitchUrl(lang: Language, search: string, pathname = '/'): string {
  const rest = searchWithoutLang(search).slice(1);
  const to = equivalentPath(lang, pathname);
  const target = to === null ? '' : `&to=${encodeURIComponent(to)}`;
  return `/?lang=${lang}${target}${rest ? `&${rest}` : ''}`;
}
