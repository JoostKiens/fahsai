import { apiUrl } from '@/lib/api';

export const REQUEST_TIMEOUT_MS = 4000;

export interface FetchOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/** What the API answered: its status, and the JSON body when the answer was OK. */
export interface Fetched {
  status: number;
  ok: boolean;
  body: unknown;
}

/**
 * GETs an API route while Astro renders a page, so it never throws: null when the API could not be
 * reached, took longer than `timeoutMs` or sent something that is not JSON. A 404 is an answer
 * (an unknown city), so it comes back with `ok: false` and no warning; any other failure status is
 * warned about.
 */
export async function fetchApi(
  path: string,
  { fetchFn = fetch, timeoutMs = REQUEST_TIMEOUT_MS }: FetchOptions = {},
): Promise<Fetched | null> {
  try {
    const res = await fetchFn(apiUrl(path), { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      if (res.status !== 404) console.warn(`[serverFetch] ${path} answered ${res.status}`);
      return { status: res.status, ok: false, body: null };
    }
    return { status: res.status, ok: true, body: (await res.json()) as unknown };
  } catch (error) {
    console.warn(`[serverFetch] ${path} failed:`, error);
    return null;
  }
}
