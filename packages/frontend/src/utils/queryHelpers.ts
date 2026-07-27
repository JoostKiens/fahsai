const EMPTY_DATA_STALE_MS = 5 * 60 * 1000;

// Returns Infinity for non-empty arrays (immutable historical data) and
// EMPTY_DATA_STALE_MS for empty results so the query re-checks after ingestion
// rather than caching a 404 response forever.
interface HasArrayData {
  state: { data?: ArrayLike<unknown> | null };
}

export const staleTimeForArray = (q: HasArrayData): number =>
  q.state.data?.length ? Infinity : EMPTY_DATA_STALE_MS;

// Same intent as staleTimeForArray but for single-object query results (e.g. a
// nearest-point lookup) where null means "not found" rather than "empty array".
interface HasNullableData {
  state: { data?: unknown };
}

export const staleTimeForNullable = (q: HasNullableData): number =>
  q.state.data !== null && q.state.data !== undefined ? Infinity : EMPTY_DATA_STALE_MS;
