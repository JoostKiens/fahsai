import type { FastifyInstance } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { redis } from '../cache/client.js';
import { HISTORICAL_TTL_SECONDS } from '../cache/client.js';
import { explainRatelimit } from '../cache/ratelimit.js';
import { reportWarning } from '../lib/rollbar.js';
import { MS_PER_DAY, ICT_OFFSET_MS } from '@thailand-aq/consts';
import { buildPrompt, GEMINI_MODEL } from '../lib/buildPrompt.js';
import { computeScientificContext } from '../lib/computeScientificContext.js';
import { bangkokDateString } from '../utils/bkkDate.js';
import { corsOriginHeader } from '../utils/cors.js';

const DAILY_QUOTA_LIMIT = 450;
const EXPLAIN_CACHE_VERSION = 10;
const EXPLAIN_CACHE_ENABLED = process.env.NODE_ENV === 'production';
const IP_RATELIMIT_ENABLED = process.env.NODE_ENV === 'production';
const EMIT_DEBUG_PROMPT = process.env.NODE_ENV !== 'production';

export type ExplainCase =
  | 'OUTLIER_HIGH'
  | 'OUTLIER_LOW'
  | 'PLAUSIBLE_FIRE_TRANSPORT'
  | 'PLAUSIBLE_URBAN_INDUSTRIAL'
  | 'PLAUSIBLE_CLEAN'
  | 'PLAUSIBLE_REGIONAL_BACKGROUND'
  | 'PLAUSIBLE_UNCLEAR';

// Gemini RPD resets at midnight America/Los_Angeles (PDT = UTC-7, PST = UTC-8).
// Try both offsets for the next LA calendar day and return the one where LA hour == 0.
function nextMidnightPT(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const next = new Date(get('year'), get('month') - 1, get('day') + 1);
  for (const offsetH of [7, 8]) {
    const candidate = new Date(
      Date.UTC(next.getFullYear(), next.getMonth(), next.getDate(), offsetH),
    );
    const laHour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      hour12: false,
    }).format(candidate);
    if (laHour === '0' || laHour === '00') return candidate.getTime();
  }
  return Date.UTC(next.getFullYear(), next.getMonth(), next.getDate(), 8);
}

function explainCacheKey(stationId: string, date: string, lang: string): string {
  return `explain:v${EXPLAIN_CACHE_VERSION}:${stationId}:${date}:${lang}`;
}

export function explainRoutes(app: FastifyInstance): void {
  app.post<{ Body: { stationId: string; lat: number; lng: number; date?: string; lang?: string } }>(
    '/api/explain',
    async (req, reply) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({ error: 'AI explanation not configured' });
      }

      // reply.hijack() below bypasses @fastify/cors, so the streaming responses
      // must set their own Access-Control-Allow-Origin against the same allowlist.
      const corsOrigin = corsOriginHeader(req.headers.origin);
      const streamCorsHeaders = corsOrigin
        ? { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' }
        : {};

      const { stationId, lat, lng, lang } = req.body ?? {};
      if (!stationId || lat === undefined || lng === undefined) {
        return reply.status(400).send({ error: 'Missing required fields: stationId, lat, lng' });
      }

      if (IP_RATELIMIT_ENABLED) {
        try {
          const { success, reset } = await explainRatelimit.limit(req.ip);
          if (!success) {
            return reply.status(429).send({ type: 'ip_ratelimit', resetAtMs: reset });
          }
        } catch (err) {
          req.log.error({ err }, 'explainRatelimit: Upstash error — failing open');
        }
      }

      const todayBkk = bangkokDateString();
      const quotaKey = `explain:quota:${todayBkk}`;
      const count = await redis.incr(quotaKey);
      if (count === 1) await redis.expire(quotaKey, 86400);
      if (count > DAILY_QUOTA_LIMIT) {
        const startOfBkkDayUtcMs =
          Math.floor((Date.now() + ICT_OFFSET_MS) / MS_PER_DAY) * MS_PER_DAY - ICT_OFFSET_MS;
        return reply
          .status(429)
          .send({ type: 'quota_exceeded', resetAtMs: startOfBkkDayUtcMs + MS_PER_DAY });
      }

      const selectedDate = req.body.date ?? bangkokDateString();
      const normalizedLang = lang ?? 'en';

      if (EXPLAIN_CACHE_ENABLED) {
        const cached = await redis.get<string>(
          explainCacheKey(stationId, selectedDate, normalizedLang),
        );
        if (cached) {
          reply.hijack();
          reply.raw.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'X-Accel-Buffering': 'no',
            'Cache-Control': 'no-cache',
            ...streamCorsHeaders,
            'X-Cache': 'HIT',
          });
          reply.raw.write(cached);
          reply.raw.end();
          return;
        }
      }

      const scientificCtx = await computeScientificContext(stationId, lat, lng, selectedDate);
      if (!scientificCtx) {
        return reply.status(404).send({ error: 'Station not found' });
      }
      const prompt = buildPrompt(scientificCtx, normalizedLang);

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache',
        ...streamCorsHeaders,
      });

      let accumulatedForCache = '';
      try {
        if (EMIT_DEBUG_PROMPT) {
          reply.raw.write('__PROMPT__' + JSON.stringify(prompt) + '\n');
        }
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
        const result = await model.generateContentStream(prompt);
        for await (const chunk of result.stream) {
          const text = chunk.text();
          accumulatedForCache += text;
          reply.raw.write(text);
        }
      } catch (err) {
        accumulatedForCache = '';
        const msg = err instanceof Error ? err.message : String(err);
        req.log.error({ err }, 'Gemini API error');
        const lower = msg.toLowerCase();
        const isRateLimit =
          (err as Record<string, unknown>).status === 429 ||
          lower.includes('resource_exhausted') ||
          lower.includes('rate limit') ||
          lower.includes('quota');
        if (isRateLimit) {
          const isDaily = lower.includes('per day') || lower.includes('daily');
          const type = isDaily
            ? 'gemini_rpd'
            : lower.includes('token')
              ? 'gemini_tpm'
              : 'gemini_rpm';
          const resetAtMs = isDaily ? nextMidnightPT() : Date.now() + 60_000;
          reportWarning('Gemini rate limit hit', { type, resetAtMs });
          reply.raw.write(`[ERROR_JSON:${JSON.stringify({ type, resetAtMs })}]`);
        } else {
          reply.raw.write(`\n\n[ERROR: ${msg}]`);
        }
      }

      reply.raw.end();

      if (EXPLAIN_CACHE_ENABLED && accumulatedForCache && selectedDate !== todayBkk) {
        void redis.set(
          explainCacheKey(stationId, selectedDate, normalizedLang),
          accumulatedForCache,
          { ex: HISTORICAL_TTL_SECONDS },
        );
      }
    },
  );
}
