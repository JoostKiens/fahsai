import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FirePoint } from '@thailand-aq/types';
import { supabase } from '../db/client.js';
import { redis, HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { parseBbox, DEFAULT_BBOX } from '../utils/bbox.js';
import { fetchAllPages } from '../utils/backfill.js';
import { bangkokMidnightIso } from '../utils/bkkDate.js';
import { offsetDate } from '../utils/trajectory.js';
import { AppError } from '../lib/app-error.js';
import { Bbox, DateString, errorResponses } from '../schemas/common.js';
import { FirePointSchema } from '../schemas/fire.js';

export function firesRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/api/fires',
    {
      schema: {
        summary: 'Fire detections for one day',
        description:
          'VIIRS daytime detections on a Bangkok calendar day, inside the bbox. 404 (no_data) when there are none.',
        tags: ['fires'],
        querystring: Type.Object({ date: DateString, bbox: Type.Optional(Bbox) }),
        response: {
          200: Type.Object({ data: Type.Array(FirePointSchema) }),
          ...errorResponses(400, 404),
        },
      },
    },
    async (req, reply) => {
      const { date, bbox: rawBbox } = req.query;

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
        throw new AppError({ code: 'no_data', message: 'No fire data for this date.' });
      }

      if (isDefaultBbox) {
        await redis.set(`fires:date:${date}`, data, { ex: HISTORICAL_TTL_SECONDS });
      }

      return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data });
    },
  );

  typed.get(
    '/api/fires/range',
    {
      schema: {
        summary: 'Fire detections over a range of days',
        description:
          'Detections from start to end inclusive (Bangkok days), at most 10 days apart. 404 (no_data) when there are none.',
        tags: ['fires'],
        querystring: Type.Object({ start: DateString, end: DateString, bbox: Type.Optional(Bbox) }),
        response: {
          200: Type.Object({ data: Type.Array(FirePointSchema) }),
          ...errorResponses(400, 404),
        },
      },
    },
    async (req, reply) => {
      const { start, end, bbox: rawBbox } = req.query;

      const startMs = new Date(start).getTime();
      const endMs = new Date(end).getTime();
      const diffDays = (endMs - startMs) / (1000 * 60 * 60 * 24);

      if (diffDays < 0)
        throw new AppError({ code: 'invalid_request', message: 'start must be before end' });
      if (diffDays > 10)
        throw new AppError({
          code: 'invalid_request',
          message: 'Date range cannot exceed 10 days',
        });

      const bbox = parseBbox(rawBbox);
      const data = await queryFires(start, end, bbox);
      if (data.length === 0) {
        throw new AppError({ code: 'no_data', message: 'No fire data for this date range.' });
      }
      return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data });
    },
  );
}

const PAGE_SIZE = 1000;

type FireRow = {
  id: number;
  detected_at: string;
  lat: number;
  lng: number;
  frp: number | null;
  confidence: string | null;
  daynight: string | null;
};

async function queryFires(
  start: string,
  end: string,
  bbox: ReturnType<typeof parseBbox>,
): Promise<FirePoint[]> {
  const dayAfterEnd = offsetDate(end, 1);

  const rows = await fetchAllPages<FireRow>(
    (from, to) =>
      supabase
        .from('fire_points')
        .select('id, detected_at, lat, lng, frp, confidence, daynight')
        .gte('detected_at', bangkokMidnightIso(start))
        .lt('detected_at', bangkokMidnightIso(dayAfterEnd))
        .gte('lat', bbox.south)
        .lte('lat', bbox.north)
        .gte('lng', bbox.west)
        .lte('lng', bbox.east)
        .range(from, to),
    PAGE_SIZE,
  );

  return rows.map((row) => ({
    id: row.id,
    detectedAt: row.detected_at,
    lat: row.lat,
    lng: row.lng,
    frp: row.frp,
    confidence: row.confidence,
    daynight: row.daynight,
  }));
}
