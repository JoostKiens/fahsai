import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { supabase } from '../db/client.js';
import { redis } from '../cache/client.js';

const HealthSchema = Type.Object({
  status: Type.Enum(['ok', 'degraded'] as const),
  cache: Type.Enum(['connected', 'error'] as const),
  db: Type.Enum(['connected', 'error'] as const),
});

export function healthRoutes(app: FastifyInstance): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/health',
    {
      schema: {
        summary: 'Is the API healthy?',
        description:
          'Checks the cache and the database. 503 when the database is down; a cache failure is reported as degraded with 200, since routes then serve from the database.',
        tags: ['system'],
        response: { 200: HealthSchema, 503: HealthSchema },
      },
    },
    async (_req, reply) => {
      const [cacheStatus, dbStatus] = await Promise.all([checkCache(), checkDb()]);

      const isDbUp = dbStatus === 'connected';
      const isHealthy = isDbUp && cacheStatus === 'connected';

      return reply.status(isDbUp ? 200 : 503).send({
        status: isHealthy ? 'ok' : 'degraded',
        cache: cacheStatus,
        db: dbStatus,
      });
    },
  );
}

async function checkCache(): Promise<'connected' | 'error'> {
  try {
    await redis.ping();
    return 'connected';
  } catch {
    return 'error';
  }
}

async function checkDb(): Promise<'connected' | 'error'> {
  try {
    const { error } = await supabase.from('fire_points').select('id').limit(1);
    // "relation does not exist" means the DB is reachable but the table isn't created yet — still connected
    if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
      console.error('[health] Supabase error:', error);
      return 'error';
    }
    return 'connected';
  } catch (e) {
    console.error('[health] Supabase exception:', e);
    return 'error';
  }
}
