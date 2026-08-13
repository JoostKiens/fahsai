import type { FastifyInstance } from 'fastify';
import type { Station } from '@thailand-aq/types';
import { supabase } from '../db/client.js';
import { parseBbox } from '../utils/bbox.js';
import { fetchAllPages } from '../utils/backfill.js';

interface StationRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string | null;
  provider: string | null;
}

export function stationsRoutes(app: FastifyInstance): void {
  // This route's response shape (Station[]) is consumed by the published
  // fahsai-mcp-server npm package, not just this app's own frontend. Treat shape
  // changes (renames/removals, not additions) as breaking for external consumers.
  // GET /api/stations?bbox=west,south,east,north&q=name-substring
  app.get<{ Querystring: { bbox?: string; q?: string | string[] } }>(
    '/api/stations',
    async (req, reply) => {
      const bbox = parseBbox(req.query.bbox);
      const rawQ = Array.isArray(req.query.q) ? req.query.q[0] : req.query.q;
      const q = rawQ?.trim();

      const data = await fetchAllPages<StationRow>((from, to) => {
        let query = supabase
          .from('stations')
          .select('id, name, lat, lng, country, provider')
          .gte('lat', bbox.south)
          .lte('lat', bbox.north)
          .gte('lng', bbox.west)
          .lte('lng', bbox.east);
        if (q) {
          // Escape LIKE wildcards so a literal % or _ in the search term isn't
          // treated as a pattern match.
          const escapedQ = q.replace(/[%_]/g, '\\$&');
          query = query.ilike('name', `%${escapedQ}%`);
        }
        return query.order('id').range(from, to);
      }, 1000);

      const stations: Station[] = data.map((row) => ({
        id: row.id,
        name: row.name,
        lat: row.lat,
        lng: row.lng,
        country: row.country ?? '',
        provider: row.provider,
      }));

      return reply.send({ data: stations });
    },
  );

  // GET /api/stations/:id
  app.get<{ Params: { id: string } }>('/api/stations/:id', async (req, reply) => {
    const { data, error } = await supabase
      .from('stations')
      .select('id, name, lat, lng, country, provider')
      .eq('id', req.params.id)
      .single<StationRow>();

    if (error) {
      if (error.code === 'PGRST116') {
        return reply.status(404).send({ error: 'Station not found' });
      }
      throw new Error(`Supabase stations query failed: ${error.message}`);
    }

    const station: Station = {
      id: data.id,
      name: data.name,
      lat: data.lat,
      lng: data.lng,
      country: data.country ?? '',
      provider: data.provider,
    };

    return reply.send(station);
  });
}
