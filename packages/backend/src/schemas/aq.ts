import { Type } from '@fastify/type-provider-typebox';
import { DateString } from './common.js';

export const PM25GridPointSchema = Type.Object({
  lat: Type.Number(),
  lng: Type.Number(),
  pm25: Type.Number({ description: 'Daily mean from the CAMS model, µg/m³.' }),
});

// Parallel arrays instead of an array of points, to cut the per-point key names over the wire.
export const PM25GridColumnsSchema = Type.Object({
  lats: Type.Array(Type.Number()),
  lngs: Type.Array(Type.Number()),
  pm25s: Type.Array(Type.Number()),
});

export const PM25DailySummarySchema = Type.Object({
  date: DateString,
  pm25: Type.Number({ description: '95th percentile across that day’s CAMS grid, µg/m³.' }),
});
