import { AppError } from '../lib/app-error.js';
import { isBbox } from '../schemas/common.js';

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export const DEFAULT_BBOX = '89,1,114,30'; // West, South, East, North

export function parseBbox(raw: string | undefined): Bbox {
  const str = raw ?? DEFAULT_BBOX;
  // the same rule the route schemas apply, so a value that passes one passes the other
  if (!isBbox(str)) {
    throw new AppError({
      code: 'invalid_request',
      message: `Invalid bbox: "${str}" — expected "west,south,east,north"`,
    });
  }
  const [west, south, east, north] = str.split(',').map(Number) as [number, number, number, number];
  return { west, south, east, north };
}
