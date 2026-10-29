import type { ErrorCode } from '@thailand-aq/types';

const API_BASE = `${import.meta.env.VITE_API_BASE_URL}/api/v1`;

// Renaming the code in @thailand-aq/types turns this into a compile error instead of making every
// empty day look like a failure.
const NO_DATA_CODE = 'no_data' satisfies ErrorCode;

// The URL of a data route, e.g. apiUrl('/fires?date=2026-10-17'). /api/rollbar is not versioned and
// does not go through here.
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// A request the API answered, but not with the data.
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// TanStack's default retries every failure three times with backoff. A 4xx will not change on the
// next try, so only network errors and 5xx are retried.
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof HttpError && error.status < 500) return false;
  return failureCount < 3;
}

// A 404 from a date-keyed route means there is no data for that date, which is an empty state. Any
// other 404 (an unknown route, a station that does not exist) is a failure and must not look empty.
export async function isNoData(res: Response): Promise<boolean> {
  if (res.status !== 404) return false;
  const body: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  return typeof body === 'object' && body !== null && 'code' in body && body.code === NO_DATA_CODE;
}

// GETs a route that answers { data }. A day with no data gives `empty`; any other failure throws
// an HttpError carrying the status.
export async function fetchApiData<T>(
  path: string,
  label: string,
  empty: T,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(apiUrl(path), init);
  if (await isNoData(res)) return empty;
  if (!res.ok) throw new HttpError(`${label} fetch failed: ${res.status}`, res.status);
  return ((await res.json()) as { data: T }).data;
}
