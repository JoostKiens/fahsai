const API_BASE = `${import.meta.env.VITE_API_BASE_URL}/api/v1`;

// The URL of a data route, e.g. apiUrl('/fires?date=2026-10-17'). /api/rollbar is not versioned and
// does not go through here.
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

// A 404 from a date-keyed route means there is no data for that date, which is an empty state. Any
// other 404 (an unknown route, a station that does not exist) is a failure and must not look empty.
export async function isNoData(res: Response): Promise<boolean> {
  if (res.status !== 404) return false;
  const body: unknown = await res
    .clone()
    .json()
    .catch(() => null);
  return typeof body === 'object' && body !== null && 'code' in body && body.code === 'no_data';
}
