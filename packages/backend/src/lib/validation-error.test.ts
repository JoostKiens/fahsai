import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { ApiError } from '@thailand-aq/types';
import { noReporters } from '../test/no-reporters.js';
import { registerErrorHandling } from './error-handler.js';
import { useTypeBoxValidation } from './typebox-validation.js';

describe('the text of a request that failed validation', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    useTypeBoxValidation(app);
    registerErrorHandling(app, noReporters);
    app.withTypeProvider<TypeBoxTypeProvider>().get(
      '/things',
      {
        schema: {
          querystring: Type.Object({
            date: Type.String({ format: 'date' }),
            hours: Type.Number({ exclusiveMinimum: 0, maximum: 168 }),
          }),
        },
      },
      () => ({ ok: true }),
    );
    await app.ready();
  });

  afterEach(() => app.close());

  async function errorFor(url: string) {
    const res = await app.inject({ method: 'GET', url });
    return { status: res.statusCode, body: res.json<ApiError>() };
  }

  it('names the parameter that is missing', async () => {
    const { status, body } = await errorFor('/things?hours=24');

    expect(status).toBe(400);
    expect(body).toMatchObject({
      error: 'Missing required parameter: date',
      code: 'invalid_request',
      details: [{ path: 'date' }],
    });
  });

  it('names the parameter that is invalid and why', async () => {
    const { body } = await errorFor('/things?date=2026-02-30&hours=24');

    expect(body.error).toBe('Invalid parameter date: must match format "date"');
  });

  it('says what limit a number breaks', async () => {
    const { body } = await errorFor('/things?date=2026-10-17&hours=169');

    expect(body.error).toBe('Invalid parameter hours: must be <= 168');
  });

  it('says a number must be numeric', async () => {
    const { body } = await errorFor('/things?date=2026-10-17&hours=lots');

    expect(body.error).toBe('Invalid parameter hours: must be number');
  });

  it('never leaks the message field of Fastify errors', async () => {
    const { body } = await errorFor('/things');

    expect(Object.keys(body)).not.toContain('message');
  });
});
