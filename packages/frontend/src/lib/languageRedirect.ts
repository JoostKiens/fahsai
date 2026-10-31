import type { Language } from '@/store/settingsStore';

const ENGLISH_PAGE = '/';
const THAI_PAGE = '/th/';

interface Input {
  url: URL;
  /** The value of the language-preference cookie, if there is one */
  cookieLang: string | undefined;
  /** The Accept-Language request header */
  acceptLanguage: string | null;
}

export interface LanguageRedirect {
  /** Where to send the visitor: a path with the query, to be used with a 302 */
  location: string;
  /** The language to store as the visitor's preference; null leaves the stored one alone */
  rememberAs: Language | null;
}

/**
 * The language redirect (see CONTEXT.md): what to do with a request for the English entry page.
 * In order: a `?lang=` from the language switch is recorded and followed; otherwise the stored
 * preference decides; with none, the browser's top language does. Only the switch records a
 * preference. Any other address is left alone: the address a visitor asked for wins. Returns null
 * when the English page should be served as it is.
 */
export function resolveLanguageRedirect({
  url,
  cookieLang,
  acceptLanguage,
}: Input): LanguageRedirect | null {
  if (url.pathname !== ENGLISH_PAGE) return null;

  const params = new URLSearchParams(url.search);
  const chosen = params.get('lang');
  if (isLanguage(chosen)) {
    params.delete('lang');
    const query = params.toString();
    const page = chosen === 'th' ? THAI_PAGE : ENGLISH_PAGE;
    return { location: page + (query ? `?${query}` : ''), rememberAs: chosen };
  }

  const wantsThai = isLanguage(cookieLang) ? cookieLang === 'th' : prefersThai(acceptLanguage);
  return wantsThai ? { location: THAI_PAGE + url.search, rememberAs: null } : null;
}

function isLanguage(value: string | null | undefined): value is Language {
  return value === 'en' || value === 'th';
}

// The language the browser asks for most (highest q, the first listed on a tie), the way
// navigator.language was used before the server decided; true when that is Thai.
function prefersThai(header: string | null): boolean {
  if (!header) return false;
  let best: { tag: string; q: number } | null = null;
  for (const part of header.split(',')) {
    const [rawTag = '', ...params] = part.trim().split(';');
    const tag = rawTag.trim().toLowerCase();
    if (!tag || tag === '*') continue;
    const quality = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = quality === undefined ? 1 : Number(quality.slice(2));
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { tag, q };
  }
  return best?.tag.split('-')[0] === 'th';
}
