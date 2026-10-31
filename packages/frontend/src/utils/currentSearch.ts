/** The page's query string, or '' where there is no window (while Astro renders a page). */
export function currentSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}
