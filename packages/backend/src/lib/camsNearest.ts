import { nearestGridPoint } from '../utils/trajectory.js';
import { getCamsGridForDate } from './camsGrid.js';

/** The modelled PM2.5 (CAMS daily mean) at the grid point nearest to a place; null for no grid. */
export async function fetchCamsNearest(
  lat: number,
  lng: number,
  date: string,
): Promise<number | null> {
  const points = await getCamsGridForDate(date);
  return points.length === 0 ? null : nearestGridPoint(lat, lng, points).pm25;
}
