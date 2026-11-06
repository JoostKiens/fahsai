import type { APIRoute } from 'astro';
import { buildSitemap, fetchCityList } from '@/lib/sitemap';

export const prerender = false;

export const GET: APIRoute = async () => {
  const cities = await fetchCityList();
  // Without the list the file would drop every city for as long as it is cached: fail instead,
  // so a crawler tries again.
  if (!cities)
    return new Response('Sitemap unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  return new Response(buildSitemap(cities.map(({ slug }) => slug)), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
