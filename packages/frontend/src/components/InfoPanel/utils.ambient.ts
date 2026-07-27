import type { WindReading } from '@thailand-aq/types';

const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

export function degToCompass(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[idx];
}

export function findNearestWind(
  vectors: WindReading[],
  lng: number,
  lat: number,
): WindReading | null {
  if (!vectors.length) return null;
  let best: WindReading | null = null;
  let bestDist = Infinity;
  for (const v of vectors) {
    const d = (v.lng - lng) ** 2 + (v.lat - lat) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = v;
    }
  }
  return best;
}
