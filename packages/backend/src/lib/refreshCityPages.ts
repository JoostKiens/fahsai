const LOG = '[refresh-city-pages]';
const SITE = 'https://fahsai.fyi';
const REVALIDATE_TIMEOUT_MS = 15_000;

/**
 * Asks Vercel to rebuild each city page (ISR on-demand revalidation), so it shows the blend just
 * stored instead of waiting up to an hour. The API's page cache needs nothing: its key holds the
 * newest blend hour (cityPageCacheKey.ts). A page that fails to refresh still refreshes within the
 * hour, so failures are logged, not thrown.
 */
export async function refreshCityPages({
  slugs,
  bypassToken,
  fetchFn = fetch,
}: {
  slugs: readonly string[];
  /** ISR bypass token shared with Vercel; undefined skips the refresh */
  bypassToken: string | undefined;
  fetchFn?: typeof fetch;
}): Promise<{ revalidated: string[]; failed: string[] }> {
  if (slugs.length === 0) return { revalidated: [], failed: [] };
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
