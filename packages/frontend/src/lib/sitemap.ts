import type { CityListItem } from '@thailand-aq/types';
import { cityUrl } from '@/lib/cityPage';
import { fetchApi, type FetchOptions } from '@/lib/serverFetch';
import { SITE } from '@/lib/site';

const MAP_ALTERNATES = [
  `<xhtml:link rel="alternate" hreflang="en" href="${SITE}/" />`,
  `<xhtml:link rel="alternate" hreflang="th" href="${SITE}/th/" />`,
  `<xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/" />`,
].join('\n    ');

/** The cities that have a page, or null when the API cannot say. Never throws. */
export async function fetchCityList(options: FetchOptions = {}): Promise<CityListItem[] | null> {
  const answer = await fetchApi('/cities', options);
  const data = (answer?.body as { data?: unknown } | null)?.data;
  return answer?.ok && Array.isArray(data) ? (data as CityListItem[]) : null;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** sitemap.xml: the map in both languages, then a page per city. */
export function buildSitemap(citySlugs: string[]): string {
  const mapEntries = [`${SITE}/`, `${SITE}/th/`].map(
    (loc) => `  <url>
    <loc>${loc}</loc>
    ${MAP_ALTERNATES}
  </url>`,
  );
  const cityEntries = citySlugs.map(
    (slug) => `  <url>
    <loc>${escapeXml(cityUrl(slug))}</loc>
  </url>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[...mapEntries, ...cityEntries].join('\n')}
</urlset>
`;
}
