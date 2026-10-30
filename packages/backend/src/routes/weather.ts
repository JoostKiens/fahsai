import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { WeatherReading, WindReading } from '@thailand-aq/types';
import { HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { cacheGet, cacheSet } from '../cache/safe.js';
import { supabase } from '../db/client.js';
import { parseBbox } from '../utils/bbox.js';
import { weatherCacheKey, windCacheKey } from '../jobs/weather-ingest.js';
import { fetchAllPages } from '../utils/backfill.js';
import { AppError } from '../lib/app-error.js';
import { Bbox, DateString, errorResponses } from '../schemas/common.js';
import { WeatherReadingSchema, WindReadingSchema } from '../schemas/weather.js';

const PAGE_SIZE = 1000;
const MIN_COMPLETE_POINTS = 4000;

async function fetchWeatherFromDb(date: string): Promise<WeatherReading[]> {
  return fetchAllPages<WeatherReading>(
    (from, to) =>
      supabase
        .from('weather_readings')
        .select(
          'lat, lng, wind_speed_kmh, wind_direction_deg, relative_humidity_2m, precipitation_sum',
        )
        .eq('date', date)
        .range(from, to),
    PAGE_SIZE,
  );
}

async function fetchWindFromDb(date: string): Promise<WindReading[]> {
  return fetchAllPages<WindReading>(
    (from, to) =>
      supabase
        .from('weather_readings')
        .select('lat, lng, wind_speed_kmh, wind_direction_deg')
        .eq('date', date)
        .range(from, to),
    PAGE_SIZE,
  );
}

export function weatherRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/weather/wind',
    {
      schema: {
        summary: 'Wind grid for one day',
        description:
          'Wind speed and direction (snapshot at 14:00 Bangkok time) on the forecast grid, inside the bbox. 404 (no_data) when the day has not been ingested.',
        tags: ['weather'],
        querystring: Type.Object({ date: DateString, bbox: Type.Optional(Bbox) }),
        response: {
          200: Type.Object({ data: Type.Array(WindReadingSchema) }),
          ...errorResponses(400, 404),
        },
      },
    },
    async (req, reply) => {
      const { date, bbox: rawBbox } = req.query;

      const cacheKey = windCacheKey(date);
      let readings = await cacheGet<WindReading[]>(cacheKey);

      if (!readings?.length || readings.length < 4000) {
        readings = await fetchWindFromDb(date);

        if (!readings.length) {
          throw new AppError({
            code: 'no_data',
            message: 'No wind data for this date. Run the ingest job.',
          });
        }

        if (readings.length >= MIN_COMPLETE_POINTS) {
          await cacheSet(cacheKey, readings, { ex: HISTORICAL_TTL_SECONDS });
        }
      }

      const bbox = parseBbox(rawBbox);
      const filtered = readings.filter(
        (r) =>
          r.lat >= bbox.south && r.lat <= bbox.north && r.lng >= bbox.west && r.lng <= bbox.east,
      );

      return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data: filtered });
    },
  );

  typed.get(
    '/weather',
    {
      schema: {
        summary: 'Weather grid for one day',
        description:
          'Wind, humidity and precipitation on the forecast grid, inside the bbox. 404 (no_data) when the day has not been ingested.',
        tags: ['weather'],
        querystring: Type.Object({ date: DateString, bbox: Type.Optional(Bbox) }),
        response: {
          200: Type.Object({ data: Type.Array(WeatherReadingSchema) }),
          ...errorResponses(400, 404),
        },
      },
    },
    async (req, reply) => {
      const { date, bbox: rawBbox } = req.query;

      let readings = await cacheGet<WeatherReading[]>(weatherCacheKey(date));

      if (!readings?.length || readings.length < 4000) {
        readings = await fetchWeatherFromDb(date);

        if (!readings.length) {
          throw new AppError({
            code: 'no_data',
            message: 'No weather data for this date. Run the ingest job.',
          });
        }

        if (readings.length >= MIN_COMPLETE_POINTS) {
          await cacheSet(weatherCacheKey(date), readings, { ex: HISTORICAL_TTL_SECONDS });
        }
      }

      const bbox = parseBbox(rawBbox);
      const filtered = readings.filter(
        (r) =>
          r.lat >= bbox.south && r.lat <= bbox.north && r.lng >= bbox.west && r.lng <= bbox.east,
      );

      return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data: filtered });
    },
  );
}
