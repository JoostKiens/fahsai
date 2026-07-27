import type { PM25GridColumns, PM25GridPoint } from '@thailand-aq/types';

export function toGridColumns(points: PM25GridPoint[]): PM25GridColumns {
  return {
    lats: points.map((p) => p.lat),
    lngs: points.map((p) => p.lng),
    pm25s: points.map((p) => p.pm25),
  };
}
