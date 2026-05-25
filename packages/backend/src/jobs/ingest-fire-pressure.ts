import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';

const LOG = '[ingest-fire-pressure]';
const DB_BATCH_SIZE = 500;
const WINDOW_DAYS = 14;
const PAGE_SIZE = 1000;

function snapGrid(val: number): number {
  return Math.round(Math.round(val / 0.4) * 0.4 * 1000) / 1000;
}

export async function ingestFirePressure(targetDate?: string): Promise<{ upserted: number }> {
  const date = targetDate ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  const dateMs = new Date(date + 'T00:00:00Z').getTime();
  const windowStartIso = new Date(dateMs - (WINDOW_DAYS - 1) * 86400000).toISOString();
  const windowEndIso = new Date(dateMs + 86400000).toISOString();

  console.log(
    `${LOG} Computing scores for ${date} (window: ${windowStartIso.slice(0, 10)} – ${date})`,
  );

  type FireRow = { lat: number; lng: number; frp: number | null };
  const allFires: FireRow[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('fire_points')
      .select('lat, lng, frp')
      .gte('detected_at', windowStartIso)
      .lt('detected_at', windowEndIso)
      .gte('lat', 1)
      .lte('lat', 30)
      .gte('lng', 89)
      .lte('lng', 114)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`${LOG} fire_points query failed: ${error.message}`);
    const rows = (data ?? []) as FireRow[];
    allFires.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`${LOG} Found ${allFires.length} fire detections in window`);

  const gridMap = new Map<
    string,
    { lat: number; lng: number; fireCount: number; totalFrp: number }
  >();

  for (const fire of allFires) {
    const snapLat = snapGrid(fire.lat);
    const snapLng = snapGrid(fire.lng);
    const key = `${snapLat},${snapLng}`;
    const cell = gridMap.get(key) ?? { lat: snapLat, lng: snapLng, fireCount: 0, totalFrp: 0 };
    cell.fireCount++;
    cell.totalFrp += fire.frp ?? 0;
    gridMap.set(key, cell);
  }

  const rows = Array.from(gridMap.values()).map((cell) => ({
    date,
    lat: cell.lat,
    lng: cell.lng,
    fire_count: cell.fireCount,
    total_frp: Math.round(cell.totalFrp * 100) / 100,
    score:
      Math.round(
        Math.min(100, (cell.totalFrp / 1000.0) * Math.log(1 + cell.fireCount) * 10) * 100,
      ) / 100,
  }));

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('fire_pressure_scores')
          .upsert(batch, { onConflict: 'date,lat,lng' });
        if (error)
          throw new AbortError(
            `Upsert failed (batch ${Math.floor(i / DB_BATCH_SIZE) + 1}): ${error.message}`,
          );
      },
      { retries: 3, minTimeout: 1000, factor: 2 },
    );
  }

  console.log(`${LOG} ${date} — ${rows.length} grid cells upserted`);
  return { upserted: rows.length };
}
