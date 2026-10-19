import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { redis } from '../cache/client.js';
import { HISTORICAL_TTL_SECONDS, CACHE_CONTROL_IMMUTABLE } from '../cache/client.js';
import { explainRatelimit, explainContextRatelimit } from '../cache/ratelimit.js';
import { reportError, reportWarning } from '../lib/rollbar.js';
import { classifyGeminiError, formatStreamError } from '../lib/gemini-error.js';
import { createReportThrottle } from '../lib/report-throttle.js';
import { MS_PER_DAY, ICT_OFFSET_MS } from '@thailand-aq/consts';
import { buildPrompt, GEMINI_MODEL } from '../lib/buildPrompt.js';
import { computeScientificContext } from '../lib/computeScientificContext.js';
import { bangkokDateString } from '../utils/bkkDate.js';
import { corsOriginHeader } from '../utils/cors.js';
import { AppError } from '../lib/app-error.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAILY_QUOTA_LIMIT = 450;
const EXPLAIN_CACHE_VERSION = 10;
const EXPLAIN_CACHE_ENABLED = process.env.NODE_ENV === 'production';
const IP_RATELIMIT_ENABLED = process.env.NODE_ENV === 'production';
const EMIT_DEBUG_PROMPT = process.env.NODE_ENV !== 'production';
const GEMINI_REPORT_THROTTLE_WINDOW_MS = 10 * 60 * 1000;

const mayReportGeminiProblem = createReportThrottle({ windowMs: GEMINI_REPORT_THROTTLE_WINDOW_MS });

export type ExplainCase =
  | 'OUTLIER_HIGH'
  | 'OUTLIER_LOW'
  | 'PLAUSIBLE_FIRE_TRANSPORT'
  | 'PLAUSIBLE_URBAN_INDUSTRIAL'
  | 'PLAUSIBLE_CLEAN'
  | 'PLAUSIBLE_REGIONAL_BACKGROUND'
  | 'PLAUSIBLE_UNCLEAR';

function explainCacheKey(stationId: string, date: string, lang: string): string {
  return `explain:v${EXPLAIN_CACHE_VERSION}:${stationId}:${date}:${lang}`;
}

// Returns when the limit resets if this IP is over it, else null. Upstash being down must not block
// users, so any error there fails open. Kept out of the route so the AppError thrown for a hit is
// not swallowed by that fail-open catch.
async function ipRateLimitResetMs({
  limiter,
  name,
  ip,
  log,
}: {
  limiter: typeof explainRatelimit;
  name: string;
  ip: string;
  log: FastifyBaseLogger;
}): Promise<number | null> {
  if (!IP_RATELIMIT_ENABLED) return null;
  try {
    const { success, reset } = await limiter.limit(ip);
    return success ? null : reset;
  } catch (err) {
    log.error({ err, limiter: name }, 'ip rate limit: Upstash error — failing open');
    return null;
  }
}

function ipRateLimited(resetAtMs: number): AppError {
  return new AppError({
    code: 'rate_limited',
    message: 'Rate limit exceeded',
    reason: 'ip_ratelimit',
    resetAtMs,
  });
}

export function explainRoutes(app: FastifyInstance): void {
  app.post<{ Body: { stationId: string; lat: number; lng: number; date?: string; lang?: string } }>(
    '/api/explain',
    async (req, reply) => {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new AppError({ code: 'unavailable', message: 'AI explanation not configured' });
      }

      // reply.hijack() below bypasses @fastify/cors, so the streaming responses
      // must set their own Access-Control-Allow-Origin against the same allowlist.
      const corsOrigin = corsOriginHeader(req.headers.origin);
      const streamCorsHeaders = corsOrigin
        ? { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' }
        : {};

      const { stationId, lat, lng, lang } = req.body ?? {};
      if (!stationId || lat === undefined || lng === undefined) {
        throw new AppError({
          code: 'invalid_request',
          message: 'Missing required fields: stationId, lat, lng',
        });
      }

      const ipResetAtMs = await ipRateLimitResetMs({
        limiter: explainRatelimit,
        name: 'explain',
        ip: req.ip,
        log: req.log,
      });
      if (ipResetAtMs !== null) throw ipRateLimited(ipResetAtMs);

      const todayBkk = bangkokDateString();
      const quotaKey = `explain:quota:${todayBkk}`;
      const count = await redis.incr(quotaKey);
      if (count === 1) await redis.expire(quotaKey, 86400);
      if (count > DAILY_QUOTA_LIMIT) {
        const startOfBkkDayUtcMs =
          Math.floor((Date.now() + ICT_OFFSET_MS) / MS_PER_DAY) * MS_PER_DAY - ICT_OFFSET_MS;
        throw new AppError({
          code: 'rate_limited',
          message: 'Daily quota exceeded',
          reason: 'quota_exceeded',
          resetAtMs: startOfBkkDayUtcMs + MS_PER_DAY,
        });
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
        throw new AppError({ code: 'not_found', message: 'Station not found' });
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
        req.log.error({ err }, 'Gemini API error');
        const streamError = classifyGeminiError(err);
        // an outage or a spent daily limit fails every request: report each problem once per window
        if (streamError.code === 'rate_limited') {
          if (mayReportGeminiProblem(`rate_limited:${streamError.reason}`)) {
            reportWarning('Gemini rate limit hit', {
              reason: streamError.reason,
              resetAtMs: streamError.resetAtMs,
            });
          }
        } else if (mayReportGeminiProblem(err instanceof Error ? err.message : String(err))) {
          reportError(err, { path: req.url, method: req.method, requestId: req.id });
        }
        reply.raw.write(formatStreamError(streamError));
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

  // This route's response shape (ScientificContext) is consumed by the published
  // fahsai-mcp-server npm package, not just this app's own frontend. Treat shape
  // changes (renames/removals, not additions) as breaking for external consumers,
  // and bump CONTEXT_CACHE_VERSION in computeScientificContext.ts
  // (explain:context:v1 -> v2) when that happens.
  app.get<{ Querystring: { stationId?: string; lat?: string; lng?: string; date?: string } }>(
    '/api/explain/context',
    async (req, reply) => {
      const { stationId, lat: rawLat, lng: rawLng, date } = req.query;
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (!stationId || !rawLat || !rawLng || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new AppError({
          code: 'invalid_request',
          message: 'Missing required fields: stationId, lat, lng',
        });
      }
      if (date !== undefined && !DATE_RE.test(date)) {
        throw new AppError({
          code: 'invalid_request',
          message: 'Invalid date format, expected YYYY-MM-DD',
        });
      }

      const ipResetAtMs = await ipRateLimitResetMs({
        limiter: explainContextRatelimit,
        name: 'explain-context',
        ip: req.ip,
        log: req.log,
      });
      if (ipResetAtMs !== null) throw ipRateLimited(ipResetAtMs);

      const todayBkk = bangkokDateString();
      const selectedDate = date ?? todayBkk;
      const scientificCtx = await computeScientificContext(stationId, lat, lng, selectedDate);
      if (!scientificCtx) {
        throw new AppError({ code: 'not_found', message: 'Station not found' });
      }
      // Historical dates are cached server-side indefinitely (computeScientificContext),
      // so it's also safe to let clients/CDNs cache them; today's is never cached anywhere.
      if (selectedDate !== todayBkk) {
        reply.header('Cache-Control', CACHE_CONTROL_IMMUTABLE);
      }
      return reply.send(scientificCtx);
    },
  );
}
