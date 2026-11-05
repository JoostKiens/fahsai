import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { DateString, errorResponses } from '../schemas/common.js';
import { AppError } from '../lib/app-error.js';
import { getLatestCompleteDate, LATEST_DATE_LOOKBACK_DAYS } from '../lib/latestDate.js';

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

      const date = await getLatestCompleteDate();
      if (date !== null) return reply.header('Cache-Control', CACHE_CONTROL).send({ date });

      throw new AppError({
        code: 'no_data',
        message: `No complete date found in the last ${LATEST_DATE_LOOKBACK_DAYS} days`,
      });
    },
  );
}
