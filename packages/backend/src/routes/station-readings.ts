import type { FastifyInstance } from 'fastify';
import type { BaselineStat } from '@thailand-aq/types';
import { MS_PER_DAY, ICT_OFFSET_MS } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { redis, HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { parseBbox, DEFAULT_BBOX } from '../utils/bbox.js';
import { forEachPage } from '../utils/backfill.js';
import { bangkokDateString } from '../utils/bkkDate.js';

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
  pm25: number;
  readingCount: number;
  weather: WeatherData | null;
  baseline: BaselineStat | null;
}

interface Measurement {
  stationId: string;
  value: number;
  measuredAt: string;
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

      type StationReadingRow = {
        station_id: string;
        value: number;
        measured_at: string;
        stations: unknown;
      };

      // Paginate past Supabase's 1000-row server-side cap, filtering each page as it
      // arrives rather than buffering the full result set (some dates span many pages).
      // Ordered DESC so the first occurrence of each station_id across pages is always
      // its most recent reading.
      const PAGE_SIZE = 1000;
      const seen = new Set<string>();
      const latest: LatestMeasurement[] = [];
      await forEachPage<StationReadingRow>(
        (from, to) => {
          let query = supabase
            .from('station_readings')
            .select('station_id, value, measured_at, stations(id, name, lat, lng, country)')
            .gte('measured_at', since);
          if (until !== undefined) query = query.lte('measured_at', until);
          return query.order('measured_at', { ascending: false }).range(from, to);
        },
        PAGE_SIZE,
        (page) => {
          for (const row of page) {
            const station = row.stations as {
              id: string;
              name: string;
              lat: number;
              lng: number;
              country: string | null;
            } | null;
            if (!station || station.lat === null || station.lng === null) continue;
            if (seen.has(row.station_id)) continue;
            seen.add(row.station_id);

            // bbox filter
            if (
              station.lat < bbox.south ||
              station.lat > bbox.north ||
              station.lng < bbox.west ||
              station.lng > bbox.east
            )
              continue;

            latest.push({
              stationId: row.station_id,
              stationName: station.name,
              lat: station.lat,
              lng: station.lng,
              country: station.country,
              value: row.value,
              measuredAt: row.measured_at,
            });
          }
        },
      );

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
      const endDateStr = req.query.date ?? bangkokDateString();
      const todayBkk = bangkokDateString();
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
      const baselineMonths =
        startMonth === endMonth
          ? [startMonth]
          : startMonth < endMonth
            ? Array.from({ length: endMonth - startMonth + 1 }, (_, i) => startMonth + i)
            : [
                ...Array.from({ length: 12 - startMonth + 1 }, (_, i) => startMonth + i),
                ...Array.from({ length: endMonth }, (_, i) => i + 1),
              ];

      const [{ data, error }, { data: weatherData }, { data: baselineData }] = await Promise.all([
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
          .from('station_baseline')
          .select('month, day, median_pm25, p25_pm25, p75_pm25, n')
          .eq('station_id', stationId)
          .in('month', baselineMonths),
      ]);

      if (error) throw new Error(`Supabase query failed: ${error.message}`);

      // Group readings by Bangkok calendar day (UTC+7), keeping the latest reading per day
      const byDay = new Map<string, { latest: number; latestMs: number; count: number }>();
      for (const row of data ?? []) {
        const measuredMs = new Date(row.measured_at as string).getTime();
        const date = bangkokDateString(measuredMs);
        const val = row.value as number;
        const entry = byDay.get(date);
        if (!entry) {
          byDay.set(date, { latest: val, latestMs: measuredMs, count: 1 });
        } else {
          if (measuredMs > entry.latestMs) {
            entry.latest = val;
            entry.latestMs = measuredMs;
          }
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

      const baselineByMD = new Map<string, BaselineStat>();
      for (const row of baselineData ?? []) {
        baselineByMD.set(`${row.month}-${row.day}`, {
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
        const date = bangkokDateString(dayUtcMs);
        const entry = byDay.get(date);
        const m = Number(date.slice(5, 7));
        let d = Number(date.slice(8, 10));
        if (m === 2 && d === 29) d = 28;
        result.push({
          date,
          pm25: entry?.latest ?? 0,
          readingCount: entry?.count ?? 0,
          weather: weatherByDate.get(date) ?? null,
          baseline: baselineByMD.get(`${m}-${d}`) ?? null,
        });
      }

      const cacheControl = isHistorical
        ? CACHE_CONTROL_IMMUTABLE
        : `public, max-age=${CURRENT_DATE_TTL_SECONDS}`;
      return reply.header('Cache-Control', cacheControl).send({ stationId, days: result });
    },
  );

  // GET /api/stations/:stationId/baseline
  app.get<{ Params: { stationId: string } }>(
    '/api/stations/:stationId/baseline',
    async (req, reply) => {
      const { stationId } = req.params;

      const { data, error } = await supabase
        .from('station_baseline')
        .select('month, day, median_pm25, p25_pm25, p75_pm25, n, min_year, max_year')
        .eq('station_id', stationId)
        .order('month', { ascending: true })
        .order('day', { ascending: true });

      if (error) throw new Error(`Supabase query failed: ${error.message}`);

      const first = data?.[0];
      const rows = (data ?? []).map((row) => ({
        month: row.month as number,
        day: row.day as number,
        medianPm25: row.median_pm25 as number,
        p25Pm25: row.p25_pm25 as number,
        p75Pm25: row.p75_pm25 as number,
        n: row.n as number,
      }));

      return reply.header('Cache-Control', 'public, max-age=21600').send({
        data: rows,
        minYear: (first?.min_year as number) ?? null,
        maxYear: (first?.max_year as number) ?? null,
      });
    },
  );
}
