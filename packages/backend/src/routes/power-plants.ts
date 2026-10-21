import type { FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { PowerPlantCollection, PowerPlantProperties } from '@thailand-aq/types';
import { redis, HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { supabase } from '../db/client.js';
import { fetchAllPages } from '../utils/backfill.js';
import { errorResponses } from '../schemas/common.js';
import { PowerPlantCollectionSchema } from '../schemas/power-plant.js';
import { AppError } from '../lib/app-error.js';

const CACHE_KEY = 'power_plants:geojson';

interface PlantRow {
  id: number;
  name: string;
  country: string;
  fuel_type: PowerPlantProperties['fuel_type']; // a CHECK constraint keeps it to these four
  capacity_mw: number | null;
  owner: string | null;
  commissioned_year: number | null;
  lat: number;
  lng: number;
}

export function powerPlantsRoutes(app: FastifyInstance): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/power-plants',
    {
      schema: {
        summary: 'Fossil-fuel power plants',
        description:
          'Every Coal, Gas, Oil and Diesel plant in the region, as a GeoJSON FeatureCollection.',
        tags: ['power-plants'],
        response: { 200: PowerPlantCollectionSchema, ...errorResponses(503) },
      },
    },
    async (req, reply) => {
      const cached = await redis.get<PowerPlantCollection>(CACHE_KEY);
      if (cached !== null)
        return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send(cached);

      let allRows: PlantRow[];
      try {
        allRows = await fetchAllPages<PlantRow>(
          (from, to) =>
            supabase
              .from('power_plants')
              .select(
                'id, name, country, fuel_type, capacity_mw, owner, commissioned_year, lat, lng',
              )
              .order('capacity_mw', { ascending: false, nullsFirst: false })
              .range(from, to),
          1000,
        );
      } catch (err) {
        // a database failure and a table that was never ingested look the same to the client
        req.log.error({ err }, 'power_plants query failed');
        throw new AppError({
          code: 'unavailable',
          message: 'Power plant data unavailable — run ingest:power-plants',
        });
      }

      if (allRows.length === 0) {
        throw new AppError({
          code: 'unavailable',
          message: 'Power plant data unavailable — run ingest:power-plants',
        });
      }

      const geojson = buildGeojson(allRows);
      await redis.set(CACHE_KEY, geojson, { ex: HISTORICAL_TTL_SECONDS });
      return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send(geojson);
    },
  );
}

function buildGeojson(rows: PlantRow[]): PowerPlantCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        id: r.id,
        name: r.name,
        country: r.country,
        fuel_type: r.fuel_type,
        capacity_mw: r.capacity_mw,
        owner: r.owner,
        commissioned_year: r.commissioned_year,
      },
    })),
  };
}
