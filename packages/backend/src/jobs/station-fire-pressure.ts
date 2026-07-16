import pRetry, { AbortError } from 'p-retry';
import { supabase } from '../db/client.js';
import { haversineKm } from '../utils/geo.js';
import { fetchAllPages } from '../utils/backfill.js';

const LOG = '[station-fire-pressure]';
const DB_BATCH_SIZE = 500;
const WINDOW_DAYS = 14;
const PAGE_SIZE = 1000;
const DEFAULT_RADIUS_KM = 75;

type FireRow = { lat: number; lng: number; frp: number | null };
type Station = { id: string; lat: number; lng: number };

export interface StationFirePressureResult {
  stationId: string;
  fireCount: number;
  totalFrpMw: number;
  score: number;
}

export function computeStationFirePressureScores(
  stations: Station[],
  fires: FireRow[],
  radiusKm: number = DEFAULT_RADIUS_KM,
): StationFirePressureResult[] {
  return stations.map((station) => {
    const latRad = (station.lat * Math.PI) / 180;
    const latPad = radiusKm / 111;
    const lngPad = radiusKm / (111 * Math.cos(latRad));

    const latMin = station.lat - latPad;
    const latMax = station.lat + latPad;
    const lngMin = station.lng - lngPad;
    const lngMax = station.lng + lngPad;

    let fireCount = 0;
    let totalFrpMw = 0;

    for (const fire of fires) {
      // bbox pre-filter
      if (fire.lat < latMin || fire.lat > latMax || fire.lng < lngMin || fire.lng > lngMax) {
        continue;
      }
      // precise haversine check
      if (haversineKm(station.lat, station.lng, fire.lat, fire.lng) <= radiusKm) {
        fireCount++;
        totalFrpMw += fire.frp ?? 0;
      }
    }

    const score =
      Math.round(Math.min(100, (totalFrpMw / 9000) * Math.log(1 + fireCount) * 10) * 100) / 100;

    return { stationId: station.id, fireCount, totalFrpMw, score };
  });
}

// 14-day trailing window anchored at Bangkok midnight for `targetDate` (a BKK calendar day).
export function bkkMidnightWindow(targetDate: string): { windowStart: string; windowEnd: string } {
  const targetMs = new Date(targetDate + 'T00:00:00+07:00').getTime();
  return {
    windowStart: new Date(targetMs - WINDOW_DAYS * 86400_000).toISOString(),
    windowEnd: new Date(targetDate + 'T00:00:00+07:00').toISOString(),
  };
}

export async function runStationFirePressure(
  targetDate: string,
  stations: Station[],
): Promise<{ upserted: number }> {
  const { windowStart, windowEnd } = bkkMidnightWindow(targetDate);

  console.log(
    `${LOG} Computing scores for ${targetDate} (window: ${windowStart.slice(0, 10)} – ${new Date(new Date(windowEnd).getTime() - 86400_000).toISOString().slice(0, 10)})`,
  );

  const allFires = await fetchAllPages<FireRow>(
    (from, to) =>
      supabase
        .from('fire_points')
        .select('lat, lng, frp')
        .gte('detected_at', windowStart)
        .lt('detected_at', windowEnd)
        .gte('lat', 1)
        .lte('lat', 30)
        .gte('lng', 89)
        .lte('lng', 114)
        .range(from, to),
    PAGE_SIZE,
  );

  console.log(`${LOG} Found ${allFires.length} fire detections in window`);

  const results = computeStationFirePressureScores(stations, allFires);

  const rows = results.map((r) => ({
    station_id: r.stationId,
    date: targetDate,
    fire_count: r.fireCount,
    total_frp_mw: r.totalFrpMw,
    score: r.score,
  }));

  for (let i = 0; i < rows.length; i += DB_BATCH_SIZE) {
    const batch = rows.slice(i, i + DB_BATCH_SIZE);
    await pRetry(
      async () => {
        const { error } = await supabase
          .from('station_fire_pressure')
          .upsert(batch, { onConflict: 'station_id,date' });
        if (error)
          throw new AbortError(
            `Upsert failed (batch ${Math.floor(i / DB_BATCH_SIZE) + 1}): ${error.message}`,
          );
      },
      { retries: 3, minTimeout: 1000, factor: 2 },
    );
  }

  console.log(`${LOG} ${targetDate} — ${rows.length} station scores upserted`);
  return { upserted: rows.length };
}
