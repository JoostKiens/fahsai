/**
 * A query string without its `lang` parameters, the others exactly as they were (not decoded and
 * encoded again), so the same query reads the same whichever rule redirected it.
 */
export function searchWithoutLang(search: string): string {
  const kept = search
    .replace(/^\?/, '')
    .split('&')
    .filter((pair) => pair !== '' && nameOf(pair) !== 'lang');
  return kept.length > 0 ? `?${kept.join('&')}` : '';
}

function nameOf(pair: string): string {
  const raw = pair.split('=', 1)[0] ?? '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}
