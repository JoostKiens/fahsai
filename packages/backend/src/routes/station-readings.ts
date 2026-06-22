import type { FastifyInstance } from 'fastify';
import type { Measurement, ClimatologyStat } from '@thailand-aq/types';
import { MS_PER_DAY, ICT_OFFSET_MS } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { redis, HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { parseBbox, DEFAULT_BBOX } from '../utils/bbox.js';

const MAX_HISTORY_HOURS = 168; // 7 days
const CURRENT_DATE_TTL_SECONDS = 3600;

interface WeatherData {
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  precipitationSumMm: number | null;
  relativeHumidity2m: number | null;
}

interface DayData {
  date: string;
  meanPm25: number;
  readingCount: number;
  weather: WeatherData | null;
  climatology: ClimatologyStat | null;
}

interface LatestMeasurement {
  stationId: string;
  stationName: string;
  lat: number;
  lng: number;
  country: string | null;
  value: number;
  measuredAt: string;
}

export function stationReadingsRoutes(app: FastifyInstance): void {
  // GET /api/station-readings/latest?bbox=...&date=YYYY-MM-DD
  app.get<{ Querystring: { bbox?: string; date?: string } }>(
    '/api/station-readings/latest',
    async (req, reply) => {
      const rawBbox = req.query.bbox;
      const date = req.query.date; // optional; when absent, returns last 24h

      const bbox = parseBbox(rawBbox);
      const isDefaultBbox = !rawBbox || rawBbox === DEFAULT_BBOX;
      const cacheKey = `station-readings:latest:pm25:${date ?? 'current'}`;

      if (isDefaultBbox) {
        const cached = await redis.get<LatestMeasurement[]>(cacheKey);
        if (cached !== null && cached.length > 0)
          return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data: cached });
      }

      // Date-specific window or rolling 24h
      const since = date
        ? `${date}T00:00:00Z`
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const until = date ? `${date}T23:59:59Z` : undefined;

      let query = supabase
        .from('station_readings')
        .select('station_id, value, measured_at, stations(id, name, lat, lng, country)')
        .gte('measured_at', since);

      if (until !== undefined) {
        query = query.lte('measured_at', until);
      }

      // Paginate past Supabase's 1000-row server-side cap. Ordered DESC so the first
      // occurrence of each station_id across pages is always its most recent reading.
      const seen = new Set<string>();
      const latest: LatestMeasurement[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;
      while (true) {
        const { data: rows, error } = await query
          .order('measured_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(`Supabase query failed: ${error.message}`);

        for (const row of rows ?? []) {
          const station = row.stations as unknown as {
            id: string;
            name: string;
            lat: number;
            lng: number;
            country: string | null;
          } | null;
          if (!station || station.lat === null || station.lng === null) continue;
          if (seen.has(row.station_id as string)) continue;
          seen.add(row.station_id as string);

          // bbox filter
          if (
            station.lat < bbox.south ||
            station.lat > bbox.north ||
            station.lng < bbox.west ||
            station.lng > bbox.east
          )
            continue;

          latest.push({
            stationId: row.station_id as string,
            stationName: station.name,
            lat: station.lat,
            lng: station.lng,
            country: station.country,
            value: row.value as number,
            measuredAt: row.measured_at as string,
          });
        }

        if (!rows?.length || rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      if (latest.length === 0) {
        return reply.status(404).send({ error: 'No station readings for this date.' });
      }

      if (isDefaultBbox) {
        await redis.set(cacheKey, latest, { ex: HISTORICAL_TTL_SECONDS });
      }

      return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data: latest });
    },
  );

  // GET /api/station-readings/history?station_id=...&hours=24
  app.get<{ Querystring: { station_id?: string; hours?: string } }>(
    '/api/station-readings/history',
    async (req, reply) => {
      const { station_id: stationId, hours: rawHours } = req.query;

      if (!stationId)
        return reply.status(400).send({ error: 'Missing required param: station_id' });

      const hours = rawHours !== undefined ? Number(rawHours) : 24;
      if (isNaN(hours) || hours <= 0) {
        return reply.status(400).send({ error: 'hours must be a positive number' });
      }
      if (hours > MAX_HISTORY_HOURS) {
        return reply
          .status(400)
          .send({ error: `hours cannot exceed ${MAX_HISTORY_HOURS} (7 days)` });
      }

      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('station_readings')
        .select('station_id, value, measured_at')
        .eq('station_id', stationId)
        .gte('measured_at', since)
        .order('measured_at', { ascending: true });

      if (error) throw new Error(`Supabase query failed: ${error.message}`);

      const measurements: Measurement[] = (data ?? []).map((row) => ({
        stationId: row.station_id as string,
        value: row.value as number,
        measuredAt: row.measured_at as string,
      }));

      return reply.send({ data: measurements });
    },
  );

  // GET /api/stations/:stationId/history?days=7&date=YYYY-MM-DD
  // date = selected end date in BKK timezone (defaults to today BKK).
  // Returns `days` rows ending on that date (inclusive), oldest-first.
  // Weather comes from station_weather (pre-computed at ingest time), not weather_readings.
  app.get<{ Params: { stationId: string }; Querystring: { days?: string; date?: string } }>(
    '/api/stations/:stationId/history',
    async (req, reply) => {
      const { stationId } = req.params;
      const rawDays = req.query.days;
      const days = rawDays !== undefined ? Number(rawDays) : 7;

      if (isNaN(days) || days <= 0) {
        return reply.status(400).send({ error: 'days must be a positive number' });
      }
      if (days > 30) {
        return reply.status(400).send({ error: 'days cannot exceed 30' });
      }

      // Anchor the window to the requested end date (BKK); default to today BKK.
      const endDateStr =
        req.query.date ?? new Date(Date.now() + ICT_OFFSET_MS).toISOString().slice(0, 10);
      const todayBkk = new Date(Date.now() + ICT_OFFSET_MS).toISOString().slice(0, 10);
      const isHistorical = endDateStr < todayBkk;

      const [yr, mo, dy] = endDateStr.split('-').map(Number);
      // UTC ms of BKK midnight for the end date (BKK midnight = UTC date - 7h)
      const endMidnightUtcMs = Date.UTC(yr, mo - 1, dy) - ICT_OFFSET_MS;
      const startMidnightUtcMs = endMidnightUtcMs - (days - 1) * MS_PER_DAY;

      const since = new Date(startMidnightUtcMs).toISOString();
      const until = new Date(endMidnightUtcMs + MS_PER_DAY).toISOString(); // exclusive

      // BKK calendar start date for weather query
      const startDateStr = new Date(Date.UTC(yr, mo - 1, dy) - (days - 1) * MS_PER_DAY)
        .toISOString()
        .slice(0, 10);

      const startMonth = Number(startDateStr.slice(5, 7));
      const endMonth = Number(endDateStr.slice(5, 7));
      const climMonths =
        startMonth === endMonth
          ? [startMonth]
          : startMonth < endMonth
            ? Array.from({ length: endMonth - startMonth + 1 }, (_, i) => startMonth + i)
            : [
                ...Array.from({ length: 12 - startMonth + 1 }, (_, i) => startMonth + i),
                ...Array.from({ length: endMonth }, (_, i) => i + 1),
              ];

      const [{ data, error }, { data: weatherData }, { data: climData }] = await Promise.all([
        supabase
          .from('station_readings')
          .select('value, measured_at')
          .eq('station_id', stationId)
          .gte('measured_at', since)
          .lt('measured_at', until),
        supabase
          .from('station_weather')
          .select(
            'date, wind_speed_kmh, wind_direction_deg, precipitation_sum, relative_humidity_2m',
          )
          .eq('station_id', stationId)
          .gte('date', startDateStr)
          .lte('date', endDateStr),
        supabase
          .from('station_climatology')
          .select('month, day, median_pm25, p25_pm25, p75_pm25, n')
          .eq('station_id', stationId)
          .in('month', climMonths),
      ]);

      if (error) throw new Error(`Supabase query failed: ${error.message}`);

      // Group readings by Bangkok calendar day (UTC+7)
      const byDay = new Map<string, { max: number; count: number }>();
      for (const row of data ?? []) {
        const bkkMs = new Date(row.measured_at as string).getTime() + ICT_OFFSET_MS;
        const date = new Date(bkkMs).toISOString().slice(0, 10);
        const val = row.value as number;
        const entry = byDay.get(date);
        if (!entry) {
          byDay.set(date, { max: val, count: 1 });
        } else {
          if (val > entry.max) entry.max = val;
          entry.count++;
        }
      }

      const weatherByDate = new Map<string, WeatherData>();
      for (const row of weatherData ?? []) {
        weatherByDate.set(row.date as string, {
          windSpeedKmh: row.wind_speed_kmh as number | null,
          windDirectionDeg: row.wind_direction_deg as number | null,
          precipitationSumMm: row.precipitation_sum as number | null,
          relativeHumidity2m: row.relative_humidity_2m as number | null,
        });
      }

      const climByMD = new Map<string, ClimatologyStat>();
      for (const row of climData ?? []) {
        climByMD.set(`${row.month}-${row.day}`, {
          medianPm25: row.median_pm25 as number,
          p25Pm25: row.p25_pm25 as number,
          p75Pm25: row.p75_pm25 as number,
          n: row.n as number,
        });
      }

      // Build result: oldest-first, from (endDate - days + 1) to endDate
      const result: DayData[] = [];
      for (let i = 0; i < days; i++) {
        const dayUtcMs = startMidnightUtcMs + i * MS_PER_DAY;
        const date = new Date(dayUtcMs + ICT_OFFSET_MS).toISOString().slice(0, 10);
        const entry = byDay.get(date);
        const m = Number(date.slice(5, 7));
        const d = Number(date.slice(8, 10));
        result.push({
          date,
          // one daily-average row per station per day (OpenAQ /hours/daily), so max() returns that day's mean
          meanPm25: entry?.max ?? 0,
          readingCount: entry?.count ?? 0,
          weather: weatherByDate.get(date) ?? null,
          climatology: climByMD.get(`${m}-${d}`) ?? null,
        });
      }

      const cacheControl = isHistorical
        ? CACHE_CONTROL_IMMUTABLE
        : `public, max-age=${CURRENT_DATE_TTL_SECONDS}`;
      return reply.header('Cache-Control', cacheControl).send({ stationId, days: result });
    },
  );
}
