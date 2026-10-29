import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Station } from '@thailand-aq/types';
import { supabase } from '../db/client.js';
import { parseBbox } from '../utils/bbox.js';
import { fetchAllPages } from '../utils/backfill.js';
import { Bbox, errorResponses } from '../schemas/common.js';
import { StationSchema } from '../schemas/station.js';
import { AppError } from '../lib/app-error.js';

interface StationRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string | null;
  provider: string | null;
}

export function stationsRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  // This route's response shape (Station[]) is consumed by the published
  // fahsai-mcp-server npm package, not just this app's own frontend. Treat shape
  // changes (renames/removals, not additions) as breaking for external consumers.
  typed.get(
    '/stations',
    {
      schema: {
        summary: 'List monitoring stations',
        description:
          'Stations inside the bbox, ordered by id. q keeps stations whose name contains it, ignoring case; both filters apply together.',
        tags: ['stations'],
        querystring: Type.Object({
          bbox: Type.Optional(Bbox),
          q: Type.Optional(
            Type.Union([Type.String(), Type.Array(Type.String())], {
              description: 'Name substring; when repeated, the first value is used.',
            }),
          ),
        }),
        response: { 200: Type.Object({ data: Type.Array(StationSchema) }), ...errorResponses(400) },
      },
    },
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

  typed.get(
    '/stations/:id',
    {
      schema: {
        summary: 'Get one station',
        description: 'Only answers whether the station id exists, and where it is.',
        tags: ['stations'],
        params: Type.Object({ id: Type.String() }),
        response: { 200: StationSchema, ...errorResponses(404) },
      },
    },
    async (req, reply) => {
      const { data, error } = await supabase
        .from('stations')
        .select('id, name, lat, lng, country, provider')
        .eq('id', req.params.id)
        .single<StationRow>();

      if (error) {
        if (error.code === 'PGRST116') {
          throw new AppError({ code: 'not_found', message: 'Station not found' });
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
    },
  );
}
