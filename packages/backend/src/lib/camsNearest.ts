import { supabase } from '../db/client.js';
import { fetchAllPages } from '../utils/backfill.js';
import { nearestGridPoint } from '../utils/trajectory.js';

// The CAMS grid is 0.4° apart, so the nearest point to any place is within this box.
const BOX_DEG = 0.5;
const PAGE_SIZE = 1000;

interface CamsRow {
  lat: number;
  lng: number;
  pm25: number;
}

/** The modelled PM2.5 (CAMS daily mean) at the grid point nearest to a place, or null if none near. */
export async function fetchCamsNearest(
  lat: number,
  lng: number,
  date: string,
): Promise<number | null> {
  const rows = await fetchAllPages<CamsRow>(
    (from, to) =>
      supabase
        .from('cams_grid')
        .select('lat, lng, pm25')
        .eq('date', date)
        .gte('lat', lat - BOX_DEG)
        .lte('lat', lat + BOX_DEG)
        .gte('lng', lng - BOX_DEG)
        .lte('lng', lng + BOX_DEG)
        .range(from, to),
    PAGE_SIZE,
  );
  return rows.length === 0 ? null : nearestGridPoint(lat, lng, rows).pm25;
}
