import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  Type,
  TypeBoxTypeProvider,
  TypeBoxValidatorCompiler,
} from '@fastify/type-provider-typebox';
import { registerApiDocs } from './api-docs.js';

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
    app.setValidatorCompiler(TypeBoxValidatorCompiler);
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

    it('rejects a missing required parameter', async () => {
      const res = await app.inject({ method: 'GET', url: '/things' });

      expect(res.statusCode).toBe(400);
    });
  });
});
