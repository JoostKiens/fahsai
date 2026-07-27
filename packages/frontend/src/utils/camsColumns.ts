import type { PM25GridColumns, PM25GridPoint } from '@thailand-aq/types';

export function zipGridColumns({ lats, lngs, pm25s }: PM25GridColumns): PM25GridPoint[] {
  return lats.map((lat, i) => ({ lat, lng: lngs[i], pm25: pm25s[i] }));
}
