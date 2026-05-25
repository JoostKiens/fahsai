import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import { fetchLocations, extractPm25SensorIds } from '../lib/openaq.js';

export async function runStationsIngest(): Promise<{
  stationsUpserted: number;
}> {
  console.log('[stations-ingest] Fetching OpenAQ locations...');
  const locations = await fetchLocations();
  console.log(`[stations-ingest] Fetched ${locations.length} locations`);

  const STALE_THRESHOLD_DAYS = 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - STALE_THRESHOLD_DAYS);

  const fresh = locations.filter(
    (loc) => !loc.datetimeLast || new Date(loc.datetimeLast.utc) >= cutoff,
  );
  console.log(
    `[stations-ingest] skipped ${locations.length - fresh.length} stale stations (datetimeLast > 30d)`,
  );

  const stationRows = fresh
    .filter((loc) => loc.coordinates !== null && loc.name != null)
    .map((loc) => ({
      id: String(loc.id),
      name: loc.name,
      lat: loc.coordinates!.latitude,
      lng: loc.coordinates!.longitude,
      country: loc.country?.code ?? null,
      pm25_sensor_ids: extractPm25SensorIds(loc),
    }));

  await pRetry(
    async () => {
      const { error } = await supabase.from('stations').upsert(stationRows, { onConflict: 'id' });
      if (error) throw new AbortError(`Stations upsert failed: ${error.message}`);
    },
    {
      retries: 3,
      minTimeout: 1000,
      factor: 2,
      onFailedAttempt: (err) =>
        console.warn(
          `[stations-ingest] Supabase upsert attempt ${err.attemptNumber} failed, ${err.retriesLeft} retries left: ${err.message}`,
        ),
    },
  );
  console.log(`[stations-ingest] Upserted ${stationRows.length} stations`);

  return { stationsUpserted: stationRows.length };
}
