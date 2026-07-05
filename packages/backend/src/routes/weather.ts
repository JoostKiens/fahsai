import type { FastifyInstance } from 'fastify';
import type { WeatherReading, WindReading } from '@thailand-aq/types';
import { redis, HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { supabase } from '../db/client.js';
import { parseBbox } from '../utils/bbox.js';
import { weatherCacheKey, windCacheKey } from '../jobs/weather-ingest.js';
import { fetchAllPages } from '../utils/backfill.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
  // GET /api/weather/wind?date=YYYY-MM-DD&bbox=west,south,east,north
  app.get<{ Querystring: { date?: string; bbox?: string } }>(
    '/api/weather/wind',
    async (req, reply) => {
      const { date, bbox: rawBbox } = req.query;

      if (!date || !DATE_RE.test(date)) {
        return reply.status(400).send({ error: 'date param required (YYYY-MM-DD)' });
      }

      const cacheKey = windCacheKey(date);
      let readings = await redis.get<WindReading[]>(cacheKey);

      if (!readings?.length || readings.length < 4000) {
        readings = await fetchWindFromDb(date);

        if (!readings.length) {
          return reply
            .status(404)
            .send({ error: 'No wind data for this date. Run the ingest job.' });
        }

        if (readings.length >= MIN_COMPLETE_POINTS) {
          await redis.set(cacheKey, readings, { ex: HISTORICAL_TTL_SECONDS });
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

  app.get<{ Querystring: { date?: string; bbox?: string } }>('/api/weather', async (req, reply) => {
    const { date, bbox: rawBbox } = req.query;

    if (!date || !DATE_RE.test(date)) {
      return reply.status(400).send({ error: 'date param required (YYYY-MM-DD)' });
    }

    let readings = await redis.get<WeatherReading[]>(weatherCacheKey(date));

    if (!readings?.length || readings.length < 4000) {
      readings = await fetchWeatherFromDb(date);

      if (!readings.length) {
        return reply
          .status(404)
          .send({ error: 'No weather data for this date. Run the ingest job.' });
      }

      if (readings.length >= MIN_COMPLETE_POINTS) {
        await redis.set(weatherCacheKey(date), readings, { ex: HISTORICAL_TTL_SECONDS });
      }
    }

    const bbox = parseBbox(rawBbox);
    const filtered = readings.filter(
      (r) => r.lat >= bbox.south && r.lat <= bbox.north && r.lng >= bbox.west && r.lng <= bbox.east,
    );

    return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data: filtered });
  });
}
