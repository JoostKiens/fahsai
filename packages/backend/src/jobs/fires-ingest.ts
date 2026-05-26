import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import { redis } from '../cache/client.js';
import { fetchFirms, FirmsHttpError } from '../utils/firms.js';

export async function runFiresIngest(date?: string): Promise<{ inserted: number }> {
  const targetDate = date ?? new Date().toISOString().slice(0, 10);

  console.log(`[fires-ingest] Fetching FIRMS data for ${targetDate}...`);
  const rows = await pRetry(
    async () => {
      try {
        return await fetchFirms(targetDate);
      } catch (err) {
        if (err instanceof FirmsHttpError && err.status >= 400 && err.status < 500)
          throw new AbortError(err);
        throw err;
      }
    },
    {
      retries: 3,
      minTimeout: 2000,
      factor: 2,
      onFailedAttempt: (err) => {
        const cause =
          err.cause instanceof Error
            ? ((err.cause as { code?: string }).code ?? err.cause.name ?? err.cause.message)
            : undefined;
        console.warn(
          `[fires-ingest] attempt ${err.attemptNumber} failed, ${err.retriesLeft} retries left: ${err.message}${cause ? ` (${cause})` : ''}`,
        );
      },
    },
  );
  console.log(`[fires-ingest] Fetched ${rows.length} rows`);

  if (rows.length === 0) {
    console.warn(`[fires-ingest] No fire data returned for ${targetDate} — skipping writes`);
    return { inserted: 0 };
  }

  const records = rows.map((row) => ({
    detected_at: row.detectedAt,
    lat: row.lat,
    lng: row.lng,
    frp: row.frp,
    confidence: row.confidence,
    daynight: row.daynight,
  }));

  await pRetry(
    async () => {
      const { error } = await supabase
        .from('fire_points')
        .upsert(records, { onConflict: 'detected_at,lat,lng', ignoreDuplicates: true });
      if (error) {
        const detail = `code=${error.code ?? '?'} message="${error.message}" details="${error.details ?? '-'}" hint="${error.hint ?? '-'}"`;
        console.error(`[fires-ingest] Supabase upsert error: ${detail}`);
        // Abort immediately on definitive schema/constraint errors; retry on transient failures.
        const isClientError =
          error.code?.startsWith('22') || // data exception
          error.code?.startsWith('23') || // integrity constraint
          error.code?.startsWith('42'); // syntax/schema
        if (isClientError)
          throw new AbortError(`Supabase upsert failed (${error.code}): ${error.message}`);
        throw new Error(`Supabase upsert failed (${error.code}): ${error.message}`);
      }
    },
    {
      retries: 3,
      minTimeout: 1000,
      factor: 2,
      onFailedAttempt: (err) =>
        console.warn(
          `[fires-ingest] Supabase upsert attempt ${err.attemptNumber} failed, ${err.retriesLeft} retries left: ${err.message}`,
        ),
    },
  );

  // Invalidate rather than set: the fires route paginates and applies bbox filtering before
  // caching, so the cached value is not the raw upserted rows. Deleting the key lets the
  // route repopulate with the correct shape on the next request.
  await redis.del(`fires:date:${targetDate}`);

  console.log(`[fires-ingest] Upserted ${records.length} rows (duplicates silently skipped)`);
  return { inserted: records.length };
}
