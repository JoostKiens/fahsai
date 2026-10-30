import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { PM25DailySummary, PM25GridPoint } from '@thailand-aq/types';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { cacheGet, cacheSet } from '../cache/safe.js';
import { supabase } from '../db/client.js';
import { RETENTION_DAYS } from '../jobs/prune.js';
import { parseBbox } from '../utils/bbox.js';
import { fetchAllPages } from '../utils/backfill.js';
import { nearestGridPoint } from '../utils/trajectory.js';
import { toGridColumns } from '../utils/camsColumns.js';
import { AppError } from '../lib/app-error.js';
import {
  PM25DailySummarySchema,
  PM25GridColumnsSchema,
  PM25GridPointSchema,
} from '../schemas/aq.js';
import { Bbox, DateString, errorResponses } from '../schemas/common.js';

const PAGE_SIZE = 1000;
// Full CAMS grid is 63×73 = 4,599 points. Require ≥90% before caching to Redis
// so a rate-limited partial ingest never poisons the hot cache.
const MIN_COMPLETE_POINTS = 4000;

// Daily summary covers at most the scrubber window; cap matches prune.ts RETENTION_DAYS,
// since no cams_daily_summary row survives past that window anyway.
const MAX_SUMMARY_DAYS = RETENTION_DAYS;
// The newest day's p95 is recomputed each ingest, so this series is not immutable.
const SUMMARY_TTL_SECONDS = 60 * 60; // 1 hour
const CACHE_CONTROL_SUMMARY = `public, max-age=${SUMMARY_TTL_SECONDS}`;

async function fetchCamsGridFromDb(date: string): Promise<PM25GridPoint[]> {
  return fetchAllPages<PM25GridPoint>(
    (from, to) =>
      supabase.from('cams_grid').select('lat, lng, pm25').eq('date', date).range(from, to),
    PAGE_SIZE,
  );
}

async function getCamsGridForDate(date: string): Promise<PM25GridPoint[]> {
  let points = await cacheGet<PM25GridPoint[]>(`cams:pm25:${date}`);

  if (!points?.length || points.length < MIN_COMPLETE_POINTS) {
    points = await fetchCamsGridFromDb(date);

    // Only re-populate Redis when data is complete — partial ingests must not poison the cache.
    if (points.length >= MIN_COMPLETE_POINTS) {
      void cacheSet(`cams:pm25:${date}`, points, { ex: HISTORICAL_TTL_SECONDS });
    }
  }

  return points;
}

export function camsRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/cams',
    {
      schema: {
        summary: 'PM2.5 model grid for one day',
        description:
          'Daily mean PM2.5 from the CAMS model on its grid, inside the bbox, as parallel arrays (lats, lngs, pm25s). 404 (no_data) when the day has not been ingested.',
        tags: ['cams'],
        querystring: Type.Object({ date: DateString, bbox: Type.Optional(Bbox) }),
        response: {
          200: Type.Object({ data: PM25GridColumnsSchema }),
          ...errorResponses(400, 404),
        },
      },
    },
    async (req, reply) => {
      const { date, bbox: rawBbox } = req.query;

      const points = await getCamsGridForDate(date);

      if (!points.length) {
        throw new AppError({
          code: 'no_data',
          message: 'No CAMS grid data for this date. Run the ingest job.',
        });
      }

      const bbox = parseBbox(rawBbox);
      const filtered = points.filter(
        (p) =>
          p.lat >= bbox.south && p.lat <= bbox.north && p.lng >= bbox.west && p.lng <= bbox.east,
      );

      return reply
        .header('Cache-Control', CACHE_CONTROL_IMMUTABLE)
        .send({ data: toGridColumns(filtered) });
    },
  );

  // Returns the single nearest grid point — used by InfoPanel so it doesn't need
  // to fetch the full grid just to look up one point.
  typed.get(
    '/cams/nearest',
    {
      schema: {
        summary: 'The model grid point nearest a location',
        description:
          'The CAMS grid point closest to lat/lng for the day. 404 (no_data) when the day has not been ingested.',
        tags: ['cams'],
        querystring: Type.Object({ date: DateString, lat: Type.Number(), lng: Type.Number() }),
        response: { 200: Type.Object({ data: PM25GridPointSchema }), ...errorResponses(400, 404) },
      },
    },
    async (req, reply) => {
      const { date, lat, lng } = req.query;

      const points = await getCamsGridForDate(date);

      if (!points.length) {
        throw new AppError({
          code: 'no_data',
          message: 'No CAMS grid data for this date. Run the ingest job.',
        });
      }

      return reply
        .header('Cache-Control', CACHE_CONTROL_IMMUTABLE)
        .send({ data: nearestGridPoint(lat, lng, points) });
    },
  );

  // Daily p95 PM2.5 time series powering the scrubber gradient line chart.
  typed.get(
    '/cams/summary',
    {
      schema: {
        summary: 'Daily PM2.5 summary',
        description:
          'The 95th percentile of the CAMS grid for each day from start to end, oldest first. An empty range is a 200 with no data (and no-store), not a 404.',
        tags: ['cams'],
        querystring: Type.Object({ start: DateString, end: DateString }),
        response: {
          200: Type.Object({ data: Type.Array(PM25DailySummarySchema) }),
          ...errorResponses(400),
        },
      },
    },
    async (req, reply) => {
      const { start, end } = req.query;

      if (start > end) {
        throw new AppError({ code: 'invalid_request', message: 'start must be on or before end' });
      }
      const rangeDays = Math.round(
        (new Date(end + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime()) /
          MS_PER_DAY,
      );
      if (rangeDays >= MAX_SUMMARY_DAYS) {
        throw new AppError({
          code: 'invalid_request',
          message: `range exceeds ${MAX_SUMMARY_DAYS} days`,
        });
      }

      const cacheKey = `cams:summary:${start}:${end}`;
      const cached = await cacheGet<PM25DailySummary[]>(cacheKey);
      if (cached?.length) {
        return reply.header('Cache-Control', CACHE_CONTROL_SUMMARY).send({ data: cached });
      }

      const { data, error } = await supabase
        .from('cams_daily_summary')
        .select('date, pm25_p95')
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: true });

      if (error) throw new Error(`Supabase cams_daily_summary query failed: ${error.message}`);

      const summary: PM25DailySummary[] = (data ?? []).map((row) => ({
        date: (row as { date: string }).date,
        pm25: (row as { pm25_p95: number }).pm25_p95,
      }));

      if (summary.length) {
        void cacheSet(cacheKey, summary, { ex: SUMMARY_TTL_SECONDS });
        return reply.header('Cache-Control', CACHE_CONTROL_SUMMARY).send({ data: summary });
      }

      // Empty result: no caching — the table may be mid-backfill or the range is too old.
      return reply.header('Cache-Control', 'no-store').send({ data: [] });
    },
  );
}
