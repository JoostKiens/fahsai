import pRetry, { AbortError } from 'p-retry';
import { describeFetchError } from '../utils/fetchError.js';
import { supabase } from '../db/client.js';
import { cacheDel } from '../cache/safe.js';
import { fetchFirms, FirmsHttpError } from '../utils/firms.js';
import { reportWarning } from '../lib/rollbar.js';

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
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) => {
        const cause = describeFetchError(error);
        console.warn(
          `[fires-ingest] attempt ${attemptNumber} failed, ${retriesLeft} retries left: ${error.message}${cause ? ` (${cause})` : ''}`,
        );
      },
    },
  );
  // Daytime only: the dataset has always been the ~06 UTC pass, and mixing in the ~18 UTC
  // night pass would roughly double per-day counts (fire pressure, explain) overnight.
  const dayRows = rows.filter((row) => row.daynight === 'D');
  console.log(`[fires-ingest] Fetched ${rows.length} rows, ${dayRows.length} daytime`);

  if (dayRows.length === 0) {
    console.warn(
      `[fires-ingest] No daytime fire data returned for ${targetDate} — skipping writes`,
    );
    // Usually FIRMS publishing late, not a real empty day; latest-date stalls until refilled.
    reportWarning('FIRMS returned no daytime fire rows', {
      date: targetDate,
      fetched: rows.length,
    });
    return { inserted: 0 };
  }

  const records = dayRows.map((row) => ({
    detected_at: row.detectedAt,
    lat: row.lat,
    lng: row.lng,
    frp: row.frp,
    confidence: row.confidence,
    daynight: row.daynight,
  }));

  // count reflects rows actually written: duplicates skipped by ignoreDuplicates aren't counted.
  const inserted = await pRetry(
    async () => {
      const { error, count } = await supabase.from('fire_points').upsert(records, {
        onConflict: 'detected_at,lat,lng',
        ignoreDuplicates: true,
        count: 'exact',
      });
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
      return count ?? 0;
    },
    {
      retries: 3,
      minTimeout: 1000,
      factor: 2,
      onFailedAttempt: ({ error, attemptNumber, retriesLeft }) =>
        console.warn(
          `[fires-ingest] Supabase upsert attempt ${attemptNumber} failed, ${retriesLeft} retries left: ${error.message}`,
        ),
    },
  );

  // Invalidate rather than set: the fires route paginates and applies bbox filtering before
  // caching, so the cached value is not the raw upserted rows. Deleting the key lets the
  // route repopulate with the correct shape on the next request.
  await cacheDel(`fires:date:${targetDate}`);

  console.log(`[fires-ingest] Inserted ${inserted} of ${records.length} rows (duplicates skipped)`);
  return { inserted };
}
