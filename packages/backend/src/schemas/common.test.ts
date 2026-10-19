import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { ApiError } from '@thailand-aq/types';
import { AppError } from '../lib/app-error.js';
import { registerApiDocs } from '../lib/api-docs.js';
import { registerErrorHandling } from '../lib/error-handler.js';
import { useTypeBoxValidation } from '../lib/typebox-validation.js';
import { noReporters } from '../test/no-reporters.js';
import { Bbox, DateString, errorResponses } from './common.js';

type OpenApiDocument = {
  components?: { schemas?: Record<string, unknown> };
  paths: Record<
    string,
    { get: { responses: Record<string, { description: string; content?: unknown }> } }
  >;
};

describe('shared schemas', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    useTypeBoxValidation(app);
    registerErrorHandling(app, noReporters);
    await registerApiDocs(app);
    const typed = app.withTypeProvider<TypeBoxTypeProvider>();

    typed.get(
      '/checked',
      {
        schema: {
          querystring: Type.Object({ date: DateString, bbox: Type.Optional(Bbox) }),
          response: { 200: Type.Object({ ok: Type.Boolean() }), ...errorResponses(400) },
        },
      },
      () => ({ ok: true }),
    );
    typed.get(
      '/rate-limited',
      { schema: { response: { 200: Type.Object({}), ...errorResponses(404, 429) } } },
      () => {
        throw new AppError({
          code: 'rate_limited',
          message: 'Rate limit exceeded',
          reason: 'ip_ratelimit',
          resetAtMs: 1_700_000_000_000,
        });
      },
    );
    await app.ready();
  });

  afterEach(() => app.close());

  async function status(url: string) {
    return (await app.inject({ method: 'GET', url })).statusCode;
  }

  describe('DateString', () => {
    it('accepts a real calendar day', async () => {
      expect(await status('/checked?date=2026-10-17')).toBe(200);
    });

    it.each(['2026-02-30', '2026-13-45', '17-10-2026', '2026-10-1', 'tomorrow', ''])(
      'rejects %j',
      async (date) => {
        expect(await status(`/checked?date=${date}`)).toBe(400);
      },
    );
  });

  describe('Bbox', () => {
    it.each(['100,13,101,14', '-10.5,-5,10,5.25', '89,1,114,30'])('accepts %s', async (bbox) => {
      expect(await status(`/checked?date=2026-10-17&bbox=${bbox}`)).toBe(200);
    });

    it.each(['nonsense', '1,2,3', '1,2,3,4,5', '1,two,3,4', '1,2,3,'])(
      'rejects %j before the route runs',
      async (bbox) => {
        expect(await status(`/checked?date=2026-10-17&bbox=${bbox}`)).toBe(400);
      },
    );
  });

  describe('error responses', () => {
    it('keep every field of the error, including the optional ones', async () => {
      const res = await app.inject({ method: 'GET', url: '/rate-limited' });

      expect(res.statusCode).toBe(429);
      expect(res.json<ApiError>()).toEqual({
        error: 'Rate limit exceeded',
        code: 'rate_limited',
        reason: 'ip_ratelimit',
        resetAtMs: 1_700_000_000_000,
      });
    });

    it('keep the details of a validation error', async () => {
      const res = await app.inject({ method: 'GET', url: '/checked?date=2026-02-30' });

      expect(res.json<ApiError>()).toMatchObject({
        code: 'invalid_request',
        details: [{ path: '/date', message: 'must match format "date"' }],
      });
    });

    it('appear in the OpenAPI document as one shared ApiError, with a description per status', async () => {
      const document = (
        await app.inject({ method: 'GET', url: '/docs/json' })
      ).json<OpenApiDocument>();

      expect(Object.keys(document.components?.schemas ?? {})).toEqual(['ApiError']);
      const responses = document.paths['/rate-limited']?.get.responses;
      expect(responses?.['429']?.description).toMatch(/rate limit/i);
      expect(responses?.['404']?.description).toMatch(/no_data/);
      expect(responses?.['500']?.description).toBe('An unexpected error.');
      expect(JSON.stringify(responses?.['429'])).toContain('#/components/schemas/ApiError');
    });
  });
});
