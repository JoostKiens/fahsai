import type { FastifyInstance } from 'fastify';
import type { PM25DailySummary, PM25GridPoint } from '@thailand-aq/types';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { redis, HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { supabase } from '../db/client.js';
import { parseBbox } from '../utils/bbox.js';
import { fetchAllPages } from '../utils/backfill.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;
// Full CAMS grid is 63×73 = 4,599 points. Require ≥90% before caching to Redis
// so a rate-limited partial ingest never poisons the hot cache.
const MIN_COMPLETE_POINTS = 4000;

// Daily summary covers at most the scrubber window; cap the range as a guard.
const MAX_SUMMARY_DAYS = 120;
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
  let points = await redis.get<PM25GridPoint[]>(`cams:pm25:${date}`);

  if (!points?.length || points.length < MIN_COMPLETE_POINTS) {
    points = await fetchCamsGridFromDb(date);

    // Only re-populate Redis when data is complete — partial ingests must not poison the cache.
    if (points.length >= MIN_COMPLETE_POINTS) {
      await redis.set(`cams:pm25:${date}`, points, { ex: HISTORICAL_TTL_SECONDS });
    }
  }

  return points;
}

function findNearestPoint(points: PM25GridPoint[], lat: number, lng: number): PM25GridPoint {
  let best = points[0];
  let bestDist = Infinity;
  for (const p of points) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

export function camsRoutes(app: FastifyInstance): void {
  // GET /api/cams?date=YYYY-MM-DD&bbox=west,south,east,north
  app.get<{ Querystring: { date?: string; bbox?: string } }>('/api/cams', async (req, reply) => {
    const { date, bbox: rawBbox } = req.query;

    if (!date || !DATE_RE.test(date)) {
      return reply.status(400).send({ error: 'date param required (YYYY-MM-DD)' });
    }

    const points = await getCamsGridForDate(date);

    if (!points.length) {
      return reply
        .status(404)
        .send({ error: 'No CAMS grid data for this date. Run the ingest job.' });
    }

    const bbox = parseBbox(rawBbox);
    const filtered = points.filter(
      (p) => p.lat >= bbox.south && p.lat <= bbox.north && p.lng >= bbox.west && p.lng <= bbox.east,
    );

    return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data: filtered });
  });

  // GET /api/cams/nearest?date=YYYY-MM-DD&lat=&lng=
  // Returns the single nearest grid point — used by InfoPanel so it doesn't need
  // to fetch the full grid just to look up one point.
  app.get<{ Querystring: { date?: string; lat?: string; lng?: string } }>(
    '/api/cams/nearest',
    async (req, reply) => {
      const { date, lat: rawLat, lng: rawLng } = req.query;

      if (!date || !DATE_RE.test(date)) {
        return reply.status(400).send({ error: 'date param required (YYYY-MM-DD)' });
      }

      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (!rawLat || !rawLng || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return reply.status(400).send({ error: 'lat and lng params required (numeric)' });
      }

      const points = await getCamsGridForDate(date);

      if (!points.length) {
        return reply
          .status(404)
          .send({ error: 'No CAMS grid data for this date. Run the ingest job.' });
      }

      return reply
        .header('Cache-Control', CACHE_CONTROL_IMMUTABLE)
        .send({ data: findNearestPoint(points, lat, lng) });
    },
  );

  // GET /api/cams/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
  // Daily p95 PM2.5 time series powering the scrubber gradient line chart.
  app.get<{ Querystring: { start?: string; end?: string } }>(
    '/api/cams/summary',
    async (req, reply) => {
      const { start, end } = req.query;

      if (!start || !DATE_RE.test(start) || !end || !DATE_RE.test(end)) {
        return reply.status(400).send({ error: 'start and end params required (YYYY-MM-DD)' });
      }
      if (start > end) {
        return reply.status(400).send({ error: 'start must be on or before end' });
      }
      const rangeDays = Math.round(
        (new Date(end + 'T00:00:00Z').getTime() - new Date(start + 'T00:00:00Z').getTime()) /
          MS_PER_DAY,
      );
      if (rangeDays >= MAX_SUMMARY_DAYS) {
        return reply.status(400).send({ error: `range exceeds ${MAX_SUMMARY_DAYS} days` });
      }

      const cacheKey = `cams:summary:${start}:${end}`;
      const cached = await redis.get<PM25DailySummary[]>(cacheKey);
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
        await redis.set(cacheKey, summary, { ex: SUMMARY_TTL_SECONDS });
        return reply.header('Cache-Control', CACHE_CONTROL_SUMMARY).send({ data: summary });
      }

      // Empty result: no caching — the table may be mid-backfill or the range is too old.
      return reply.header('Cache-Control', 'no-store').send({ data: [] });
    },
  );
}
