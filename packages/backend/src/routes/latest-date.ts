import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { MS_PER_DAY } from '@thailand-aq/consts';
import { cacheGet, cacheSet } from '../cache/safe.js';
import { bangkokDateString } from '../utils/bkkDate.js';
import { DateString, errorResponses } from '../schemas/common.js';
import { AppError } from '../lib/app-error.js';
import { checkDayCompleteness } from '../lib/dayCompleteness.js';

const CACHE_KEY = 'latest-complete-date';
const CACHE_TTL_SECONDS = 30 * 60; // 30 min — refreshes well within the daily ingest window
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
        const { isComplete } = await checkDayCompleteness(date);
        if (isComplete) {
          void cacheSet(CACHE_KEY, date, { ex: CACHE_TTL_SECONDS });
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
