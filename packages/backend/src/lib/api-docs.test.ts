import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { registerApiDocs } from './api-docs.js';
import { registerErrorHandling } from './error-handler.js';
import { useTypeBoxValidation } from './typebox-validation.js';
import { noReporters } from '../test/no-reporters.js';

type OpenApiDocument = {
  openapi: string;
  info: { title: string };
  paths: Record<
    string,
    { get?: { parameters?: { name: string; in: string; required?: boolean }[] } }
  >;
};

describe('API docs', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    useTypeBoxValidation(app);
    registerErrorHandling(app, noReporters);
    await registerApiDocs(app);
    app.withTypeProvider<TypeBoxTypeProvider>().get(
      '/things',
      {
        schema: {
          querystring: Type.Object({ lat: Type.Number(), tag: Type.Optional(Type.String()) }),
          response: { 200: Type.Object({ lat: Type.Number() }) },
        },
      },
      (req) => ({ lat: req.query.lat }),
    );
    await app.ready();
  });

  afterEach(() => app.close());

  it('serves an OpenAPI 3 document that lists the routes and their parameters', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const document = res.json<OpenApiDocument>();

    expect(res.statusCode).toBe(200);
    expect(document.openapi).toBe('3.0.3');
    expect(document.info.title).toBe('Fahsai API');
    expect(document.paths['/things']?.get?.parameters).toEqual([
      expect.objectContaining({ name: 'lat', in: 'query', required: true }),
      expect.objectContaining({ name: 'tag', in: 'query' }),
    ]);
  });

  // @fastify/static answers a request it refuses with its own errors; none of them is our bug
  it.each([
    ['a path it refuses', '/docs/static/%00', {}, 403],
    ['a failed If-Match', '/docs/static/swagger-ui.css', { 'if-match': '"nope"' }, 412],
    ['an unsatisfiable Range', '/docs/static/swagger-ui.css', { range: 'bytes=99999999-' }, 416],
  ])('answers %s as a client error', async (_name, url, headers, status) => {
    const res = await app.inject({ method: 'GET', url, headers });

    expect(res.statusCode).toBe(status);
    expect(res.json()).toEqual({ error: 'Invalid request', code: 'invalid_request' });
  });

  it('serves the interactive docs page', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  describe('validating with the TypeBox schemas', () => {
    it('turns a numeric querystring value into a number', async () => {
      const res = await app.inject({ method: 'GET', url: '/things?lat=13.8' });

      expect(res.json()).toEqual({ lat: 13.8 });
    });

    it('rejects a querystring value that is not a number', async () => {
      const res = await app.inject({ method: 'GET', url: '/things?lat=north' });

      expect(res.statusCode).toBe(400);
    });

    // the validator alone would turn these into 0, 1 and 16
    it.each(['', 'true', '0x10', '1e3', ' ', 'Infinity'])(
      'rejects the querystring value %j for a number',
      async (value) => {
        const res = await app.inject({ method: 'GET', url: `/things?lat=${value}` });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({
          error: 'Invalid parameter lat: must be a number',
          details: [{ path: '/lat', message: 'must be a number' }],
        });
      },
    );

    it('accepts negative and decimal numbers', async () => {
      const res = await app.inject({ method: 'GET', url: '/things?lat=-13.25' });

      expect(res.json()).toEqual({ lat: -13.25 });
    });

    it('rejects a missing required parameter', async () => {
      const res = await app.inject({ method: 'GET', url: '/things' });

      expect(res.statusCode).toBe(400);
    });
  });
});
