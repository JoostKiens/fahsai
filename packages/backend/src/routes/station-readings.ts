import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider, type Static } from '@fastify/type-provider-typebox';
import type { BaselineStat, BaselineRow } from '@thailand-aq/types';
import { mapBaselineRow } from '@thailand-aq/types';
import { MS_PER_DAY, ICT_OFFSET_MS } from '@thailand-aq/consts';
import { supabase } from '../db/client.js';
import { redis, HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { parseBbox, DEFAULT_BBOX } from '../utils/bbox.js';
import { forEachPage } from '../utils/backfill.js';
import { bangkokDateString, bangkokMidnightIso, bangkokMidnightUtcMs } from '../utils/bkkDate.js';
import { offsetDate } from '../utils/trajectory.js';
import { AppError } from '../lib/app-error.js';
import { Bbox, DateString, errorResponses, wholeNumber } from '../schemas/common.js';
import {
  BaselineResponseSchema,
  LatestMeasurementSchema,
  MeasurementSchema,
  StationDayHistorySchema,
  StationHistoryResponseSchema,
} from '../schemas/station-readings.js';

const DEFAULT_HISTORY_HOURS = 24;
const MAX_HISTORY_HOURS = 168; // 7 days
const DEFAULT_HISTORY_DAYS = 7;
const MAX_HISTORY_DAYS = 30;
const CURRENT_DATE_TTL_SECONDS = 3600;

type DayData = Static<typeof StationDayHistorySchema>;
type WeatherData = NonNullable<DayData['weather']>;
type Measurement = Static<typeof MeasurementSchema>;
type LatestMeasurement = Static<typeof LatestMeasurementSchema>;

export function stationReadingsRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/api/station-readings/latest',
    {
      schema: {
        summary: 'The latest PM2.5 reading of every station for a day',
        description:
          'One reading per station (the latest of the Bangkok day), inside the bbox. Without a date it is the last 24 hours. 404 (no_data) when there are none.',
        tags: ['station-readings'],
        querystring: Type.Object({
          bbox: Type.Optional(Bbox),
          date: Type.Optional(DateString),
        }),
        response: {
          200: Type.Object({ data: Type.Array(LatestMeasurementSchema) }),
          ...errorResponses(400, 404),
        },
      },
    },
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

      // Date-specific window (Bangkok calendar day) or rolling 24h
      const since = date
        ? bangkokMidnightIso(date)
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const until = date ? bangkokMidnightIso(offsetDate(date, 1)) : undefined;

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
            .select(
              'station_id, value, measured_at, stations(id, name, lat, lng, country, provider)',
            )
            .gte('measured_at', since);
          if (until !== undefined) query = query.lt('measured_at', until);
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
              provider: string | null;
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
              provider: station.provider,
              value: row.value,
              measuredAt: row.measured_at,
            });
          }
        },
      );

      if (latest.length === 0) {
        throw new AppError({ code: 'no_data', message: 'No station readings for this date.' });
      }

      if (isDefaultBbox) {
        await redis.set(cacheKey, latest, { ex: HISTORICAL_TTL_SECONDS });
      }

      return reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE).send({ data: latest });
    },
  );

  typed.get(
    '/api/station-readings/history',
    {
      schema: {
        summary: 'Every PM2.5 reading of a station in the last hours',
        description: 'Oldest first. For a station that does not exist the list is empty.',
        tags: ['station-readings'],
        querystring: Type.Object({
          station_id: Type.String({ minLength: 1 }),
          hours: Type.Optional(
            wholeNumber({
              minimum: 1,
              maximum: MAX_HISTORY_HOURS,
              default: DEFAULT_HISTORY_HOURS,
              description: 'How many hours back to look, at most 7 days.',
            }),
          ),
        }),
        response: {
          200: Type.Object({ data: Type.Array(MeasurementSchema) }),
          ...errorResponses(400),
        },
      },
    },
    async (req, reply) => {
      const { station_id: stationId } = req.query;
      const hours = req.query.hours ?? DEFAULT_HISTORY_HOURS;

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

  // date = selected end date in BKK timezone (defaults to today BKK).
  // Returns `days` rows ending on that date (inclusive), oldest-first.
  // Weather comes from station_weather (pre-computed at ingest time), not weather_readings.
  typed.get(
    '/api/stations/:stationId/history',
    {
      schema: {
        summary: 'A station’s recent days',
        description:
          'The latest reading, reading count, weather and seasonal baseline for each of the days up to date, oldest first. An unknown station is a 200 with zeros, not a 404.',
        tags: ['station-readings'],
        params: Type.Object({ stationId: Type.String() }),
        querystring: Type.Object({
          days: Type.Optional(
            wholeNumber({
              minimum: 1,
              maximum: MAX_HISTORY_DAYS,
              default: DEFAULT_HISTORY_DAYS,
              description: 'How many days, at most 30.',
            }),
          ),
          date: Type.Optional(DateString),
        }),
        response: { 200: StationHistoryResponseSchema, ...errorResponses(400) },
      },
    },
    async (req, reply) => {
      const { stationId } = req.params;
      const days = req.query.days ?? DEFAULT_HISTORY_DAYS;

      // Anchor the window to the requested end date (BKK); default to today BKK.
      const endDateStr = req.query.date ?? bangkokDateString();
      const todayBkk = bangkokDateString();
      const isHistorical = endDateStr < todayBkk;

      const endMidnightUtcMs = bangkokMidnightUtcMs(endDateStr);
      const startMidnightUtcMs = endMidnightUtcMs - (days - 1) * MS_PER_DAY;

      const since = new Date(startMidnightUtcMs).toISOString();
      const until = new Date(endMidnightUtcMs + MS_PER_DAY).toISOString(); // exclusive

      // BKK calendar start date for weather query
      const startDateStr = bangkokDateString(startMidnightUtcMs);

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
        // Per-row hot path: cheap arithmetic instead of bangkokDateString's Intl call
        // (Thailand has no DST, so the fixed +7h offset is exact here).
        const date = new Date(measuredMs + ICT_OFFSET_MS).toISOString().slice(0, 10);
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
        baselineByMD.set(`${row.month}-${row.day}`, mapBaselineRow(row));
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

  typed.get(
    '/api/stations/:stationId/baseline',
    {
      schema: {
        summary: 'A station’s seasonal PM2.5 baseline',
        description:
          'The median and quartiles of PM2.5 for each calendar day, from past years, ordered by month and day. An unknown station gets an empty list.',
        tags: ['station-readings'],
        params: Type.Object({ stationId: Type.String() }),
        response: { 200: BaselineResponseSchema, ...errorResponses() },
      },
    },
    async (req, reply) => {
      const { stationId } = req.params;

      const { data, error } = await supabase
        .from('station_baseline')
        .select('month, day, median_pm25, p25_pm25, p75_pm25, n, min_year, max_year')
        .eq('station_id', stationId)
        .order('month', { ascending: true })
        .order('day', { ascending: true });

      if (error) throw new Error(`Supabase query failed: ${error.message}`);

      const rows = (data ?? []).map((row) => ({
        month: row.month as number,
        day: row.day as number,
        ...mapBaselineRow(row as BaselineRow),
      }));

      // Individual rows can now carry different min_year/max_year (the daily gap-fill job
      // may create a single-year row while other rows still carry a full multi-year range),
      // so aggregate across all rows rather than trusting just the first.
      const minYears = (data ?? [])
        .map((row) => row.min_year as number | null)
        .filter((y): y is number => y !== null);
      const maxYears = (data ?? [])
        .map((row) => row.max_year as number | null)
        .filter((y): y is number => y !== null);

      return reply.header('Cache-Control', 'public, max-age=21600').send({
        data: rows,
        minYear: minYears.length > 0 ? Math.min(...minYears) : null,
        maxYear: maxYears.length > 0 ? Math.max(...maxYears) : null,
      });
    },
  );
}
