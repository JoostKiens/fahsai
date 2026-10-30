import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { cacheGet, cacheSet } from '../cache/safe.js';
import { supabase } from '../db/client.js';
import { bangkokDateString, bangkokMidnightIso } from '../utils/bkkDate.js';
import { DateString, errorResponses } from '../schemas/common.js';
import { AppError } from '../lib/app-error.js';

const CACHE_KEY = 'latest-complete-date';
const CACHE_TTL_SECONDS = 30 * 60; // 30 min — refreshes well within the daily ingest window
const AQ_GRID_MIN_ROWS = 4000; // full run = 4,599; anything less means the ingest crashed mid-batch
const WIND_MIN_ROWS = 4000; // same grid as cams; anything less means the weather ingest hasn't run yet
const LOOKBACK_DAYS = 7;

export function latestDateRoutes(app: FastifyInstance): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/latest-date',
    {
      schema: {
        summary: 'The latest day with complete data',
        description:
          'The newest of the last 7 days that has the full CAMS grid, wind data and at least one station reading. Fires are not required: a day with none is valid.',
        tags: ['data'],
        response: { 200: Type.Object({ date: DateString }), ...errorResponses(404) },
      },
    },
    async (_req, reply) => {
      const CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=60';

      const cached = await cacheGet<string>(CACHE_KEY);
      if (cached) return reply.header('Cache-Control', CACHE_CONTROL).send({ date: cached });

      const now = Date.now();

      for (let offset = 1; offset <= LOOKBACK_DAYS; offset++) {
        const date = bangkokDateString(now - offset * MS_PER_DAY);
        const nextDate = bangkokDateString(now - (offset - 1) * MS_PER_DAY);
        const dayStart = bangkokMidnightIso(date);
        const dayEnd = bangkokMidnightIso(nextDate);

        // No fires gate: 0 detections is a valid day (rain, cloud cover), and both fires runs
        // (10:00, 23:00 UTC) finish before cams/station_readings land at ~23:30 UTC anyway.
        const [aqResult, measResult, windResult] = await Promise.all([
          supabase.from('cams_grid').select('*', { count: 'exact', head: true }).eq('date', date),
          supabase
            .from('station_readings')
            .select('*', { count: 'exact', head: true })
            .gte('measured_at', dayStart)
            .lt('measured_at', dayEnd),
          supabase
            .from('weather_readings')
            .select('*', { count: 'exact', head: true })
            .eq('date', date),
        ]);

        if (
          (aqResult.count ?? 0) >= AQ_GRID_MIN_ROWS &&
          (measResult.count ?? 0) >= 1 &&
          (windResult.count ?? 0) >= WIND_MIN_ROWS
        ) {
          await cacheSet(CACHE_KEY, date, { ex: CACHE_TTL_SECONDS });
          return reply.header('Cache-Control', CACHE_CONTROL).send({ date });
        }
      }

      throw new AppError({
        code: 'no_data',
        message: `No complete date found in the last ${LOOKBACK_DAYS} days`,
      });
    },
  );
}
