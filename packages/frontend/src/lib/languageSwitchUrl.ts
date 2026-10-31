import type { Language } from '@/i18n-instance';
import { searchWithoutLang } from '@/lib/langParam';

/**
 * Where the language switch sends the browser: the redirect at `/`, which stores the choice and
 * lands on the page in that language. The rest of the query (map position, date, selection) goes
 * along; the redirect keeps it.
 */
export function languageSwitchUrl(lang: Language, search: string): string {
  const rest = searchWithoutLang(search).slice(1);
  return `/?lang=${lang}${rest ? `&${rest}` : ''}`;
}
