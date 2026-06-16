import type { FastifyInstance } from 'fastify';
import type { FirePoint } from '@thailand-aq/types';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { redis, HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { parseBbox, DEFAULT_BBOX } from '../utils/bbox.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function firesRoutes(app: FastifyInstance): void {
  // GET /api/fires?date=YYYY-MM-DD&bbox=west,south,east,north
  app.get<{ Querystring: { date?: string; bbox?: string } }>('/api/fires', async (req, reply) => {
    const { date, bbox: rawBbox } = req.query;

    if (!date) return reply.status(400).send({ error: 'Missing required param: date' });
    if (!DATE_RE.test(date))
      return reply.status(400).send({ error: 'Invalid date format, expected YYYY-MM-DD' });

    const bbox = parseBbox(rawBbox);
    const isDefaultBbox = !rawBbox || rawBbox === DEFAULT_BBOX;

    // Redis cache — only for default bbox requests
    if (isDefaultBbox) {
      const cached = await redis.get<FirePoint[]>(`fires:date:${date}`);
      if (cached !== null && cached.length > 0)
        return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data: cached });
    }

    const data = await queryFires(date, date, bbox);

    if (data.length === 0) {
      return reply.status(404).send({ error: 'No fire data for this date.' });
    }

    if (isDefaultBbox) {
      await redis.set(`fires:date:${date}`, data, { ex: HISTORICAL_TTL_SECONDS });
    }

    return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data });
  });

  // GET /api/fires/range?start=YYYY-MM-DD&end=YYYY-MM-DD&bbox=...
  app.get<{ Querystring: { start?: string; end?: string; bbox?: string } }>(
    '/api/fires/range',
    async (req, reply) => {
      const { start, end, bbox: rawBbox } = req.query;

      if (!start) return reply.status(400).send({ error: 'Missing required param: start' });
      if (!end) return reply.status(400).send({ error: 'Missing required param: end' });
      if (!DATE_RE.test(start))
        return reply.status(400).send({ error: 'Invalid start date format' });
      if (!DATE_RE.test(end)) return reply.status(400).send({ error: 'Invalid end date format' });

      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      const diffDays = (endMs - startMs) / (1000 * 60 * 60 * 24);

      if (diffDays < 0) return reply.status(400).send({ error: 'start must be before end' });
      if (diffDays > 10)
        return reply.status(400).send({ error: 'Date range cannot exceed 10 days' });

      const bbox = parseBbox(rawBbox);
      const data = await queryFires(start, end, bbox);
      if (data.length === 0) {
        return reply.status(404).send({ error: 'No fire data for this date range.' });
      }
      return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data });
    },
  );
}

const PAGE_SIZE = 1000;

async function queryFires(
  start: string,
  end: string,
  bbox: ReturnType<typeof parseBbox>,
): Promise<FirePoint[]> {
  const dayAfterEnd = new Date(new Date(end).getTime() + MS_PER_DAY).toISOString().slice(0, 10);
  const allRows: FirePoint[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('fire_points')
      .select('id, detected_at, lat, lng, frp, confidence, daynight')
      .gte('detected_at', `${start}T00:00:00Z`)
      .lt('detected_at', `${dayAfterEnd}T00:00:00Z`)
      .gte('lat', bbox.south)
      .lte('lat', bbox.north)
      .gte('lng', bbox.west)
      .lte('lng', bbox.east)
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase query failed: ${error.message}`);

    const rows = data ?? [];
    for (const row of rows) {
      allRows.push({
        id: row.id as number,
        detectedAt: row.detected_at as string,
        lat: row.lat as number,
        lng: row.lng as number,
        frp: row.frp as number | null,
        confidence: row.confidence as string | null,
        daynight: row.daynight as string | null,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allRows;
}
