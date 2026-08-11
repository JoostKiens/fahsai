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
  // GET /api/stations?bbox=west,south,east,north
  app.get<{ Querystring: { bbox?: string } }>('/api/stations', async (req, reply) => {
    const bbox = parseBbox(req.query.bbox);

    const data = await fetchAllPages<StationRow>(
      (from, to) =>
        supabase
          .from('stations')
          .select('id, name, lat, lng, country, provider')
          .gte('lat', bbox.south)
          .lte('lat', bbox.north)
          .gte('lng', bbox.west)
          .lte('lng', bbox.east)
          .order('id')
          .range(from, to),
      1000,
    );

    const stations: Station[] = data.map((row) => ({
      id: row.id,
      name: row.name,
      lat: row.lat,
      lng: row.lng,
      country: row.country ?? '',
      provider: row.provider,
    }));

    return reply.send({ data: stations });
  });

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
