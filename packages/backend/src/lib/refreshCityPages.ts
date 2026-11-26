const LOG = '[refresh-city-pages]';
const SITE = 'https://fahsai.fyi';
const API = 'https://api-server-service-production.up.railway.app';
const REVALIDATE_TIMEOUT_MS = 15_000;
// Longer than the page's own 4 s wait for the API: a cold build of a big city takes more.
const WARM_TIMEOUT_MS = 30_000;

/**
 * Asks Vercel to rebuild each city page (ISR on-demand revalidation), so it shows the blend just
 * stored instead of waiting up to an hour. The new blend hour is in the API's page cache key
 * (cityPageCacheKey.ts), so the API's first build after the blend is cold; it is requested first,
 * without the page's short timeout, so Vercel's rebuild finds it cached. A page that fails to
 * refresh still refreshes within the hour, so failures are logged, not thrown.
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
    await warmApi(slug, fetchFn);
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

/** Builds the API's city page into its cache. A failure is only logged: the rebuild may still work. */
async function warmApi(slug: string, fetchFn: typeof fetch): Promise<void> {
  try {
    const res = await fetchFn(`${API}/api/v1/cities/${slug}`, {
      signal: AbortSignal.timeout(WARM_TIMEOUT_MS),
    });
    if (!res.ok) console.warn(`${LOG} ${slug}: API answered ${res.status}`);
  } catch (err) {
    console.warn(`${LOG} ${slug}: API ${err instanceof Error ? err.message : String(err)}`);
  }
}
