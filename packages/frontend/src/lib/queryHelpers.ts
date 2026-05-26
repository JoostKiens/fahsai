const EMPTY_DATA_STALE_MS = 5 * 60 * 1000;

// Returns Infinity for non-empty arrays (immutable historical data) and
// EMPTY_DATA_STALE_MS for empty results so the query re-checks after ingestion
// rather than caching a 404 response forever.
interface HasArrayData {
  state: { data?: ArrayLike<unknown> | null };
}

export const staleTimeForArray = (q: HasArrayData): number =>
  q.state.data?.length ? Infinity : EMPTY_DATA_STALE_MS;
