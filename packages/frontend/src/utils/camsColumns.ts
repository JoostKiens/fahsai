import type { PM25GridColumns, PM25GridPoint } from '@thailand-aq/types';

export function zipGridColumns({ lats, lngs, pm25s }: PM25GridColumns): PM25GridPoint[] {
  return lats.map((lat, i) => ({ lat, lng: lngs[i], pm25: pm25s[i] }));
}

// ponytail: /api/cams responses are served with a 7-day Cache-Control, so browsers
// that cached a pre-migration response may still deliver the old PM25GridPoint[]
// shape for up to 7 days after this ships. Safe to delete this branch (and the
// PM25GridPoint[] half of the union below) once that window has fully elapsed.
export function parseCamsGridResponse(data: PM25GridColumns | PM25GridPoint[]): PM25GridPoint[] {
  return Array.isArray(data) ? data : zipGridColumns(data);
}
