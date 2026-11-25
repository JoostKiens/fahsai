import { cityPageCacheKey } from './cityPageCacheKey.js';

const LOG = '[refresh-city-pages]';
const SITE = 'https://fahsai.fyi';
const REVALIDATE_TIMEOUT_MS = 15_000;

/**
 * Makes the city pages show the blend just stored, instead of waiting up to an hour. First the
 * API's cached page for this hour goes (it was usually built before the blend), then Vercel is
 * asked to rebuild each page (ISR on-demand revalidation). A page that fails to refresh still
 * refreshes within the hour, so failures are logged, not thrown.
 */
export async function refreshCityPages({
  slugs,
  now,
  latestDate,
  deleteCacheKeys,
  bypassToken,
  fetchFn = fetch,
}: {
  slugs: readonly string[];
  now: Date;
  /** the day in the page cache key (getLatestCompleteDate); null skips the cache delete */
  latestDate: string | null;
  deleteCacheKeys: (...keys: string[]) => Promise<void>;
  /** ISR bypass token shared with Vercel; undefined skips the revalidation */
  bypassToken: string | undefined;
  fetchFn?: typeof fetch;
}): Promise<{ revalidated: string[]; failed: string[] }> {
  if (latestDate !== null) {
    await deleteCacheKeys(...slugs.map((slug) => cityPageCacheKey(slug, latestDate, now)));
  }
  if (bypassToken === undefined || bypassToken === '') {
    console.warn(`${LOG} ISR_BYPASS_TOKEN is not set: pages refresh within the hour instead`);
    return { revalidated: [], failed: [] };
  }

  const revalidated: string[] = [];
  const failed: string[] = [];
  for (const slug of slugs) {
    try {
      const res = await fetchFn(`${SITE}/city/${slug}`, {
        method: 'HEAD',
        headers: { 'x-prerender-revalidate': bypassToken },
        signal: AbortSignal.timeout(REVALIDATE_TIMEOUT_MS),
      });
      if (res.ok) revalidated.push(slug);
      else {
        failed.push(slug);
        console.warn(`${LOG} ${slug}: HTTP ${res.status}`);
      }
    } catch (err) {
      failed.push(slug);
      console.warn(`${LOG} ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log(`${LOG} revalidated ${revalidated.length}/${slugs.length} city pages`);
  return { revalidated, failed };
}
