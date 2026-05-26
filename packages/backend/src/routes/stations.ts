import type { FastifyInstance } from 'fastify';
import type { Station } from '@thailand-aq/types';
import { supabase } from '../db/client.js';
import { parseBbox } from '../utils/bbox.js';

export function stationsRoutes(app: FastifyInstance): void {
  // GET /api/stations?bbox=west,south,east,north
  app.get<{ Querystring: { bbox?: string } }>('/api/stations', async (req, reply) => {
    const bbox = parseBbox(req.query.bbox);

    const { data, error } = await supabase
      .from('stations')
      .select('id, name, lat, lng, country')
      .gte('lat', bbox.south)
      .lte('lat', bbox.north)
      .gte('lng', bbox.west)
      .lte('lng', bbox.east);

    if (error) throw new Error(`Supabase query failed: ${error.message}`);

    const stations: Station[] = (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      lat: row.lat as number,
      lng: row.lng as number,
      country: (row.country as string | null) ?? '',
    }));

    return reply.send({ data: stations });
  });
}
