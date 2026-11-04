import type { FastifyInstance } from 'fastify';
import { Type, TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { WHO_PM25_24H_UGM3 } from '@thailand-aq/consts';
import { CITIES, CITY_RADIUS_KM } from '../data/cities.js';
import { AppError } from '../lib/app-error.js';
import { buildCityPage } from '../lib/buildCityPage.js';
import { CityListItemSchema, CityPageSchema } from '../schemas/city.js';
import { errorResponses } from '../schemas/common.js';

export function citiesRoutes(app: FastifyInstance): void {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/cities',
    {
      schema: {
        summary: 'List the cities that have a page',
        tags: ['cities'],
        response: {
          200: Type.Object({ data: Type.Array(CityListItemSchema) }),
          ...errorResponses(),
        },
      },
    },
    () => ({ data: CITIES.map(({ slug, name, country }) => ({ slug, name, country })) }),
  );

  typed.get(
    '/cities/:slug',
    {
      schema: {
        summary: 'A city’s air quality for the newest complete day',
        description: `The median of the daily means of the stations within ${CITY_RADIUS_KM} km of the city centre, a seven-day trend, the stations, and nearby cities. All figures are for one Bangkok day (date). pm25 is null when no station reported that day. whoMultiple is pm25 over the WHO 24-hour guideline (${WHO_PM25_24H_UGM3} µg/m³).`,
        tags: ['cities'],
        params: Type.Object({ slug: Type.String() }),
        response: { 200: CityPageSchema, ...errorResponses(404) },
      },
    },
    async (req, reply) => {
      const page = await buildCityPage(req.params.slug);
      if (page === null) {
        throw new AppError({ code: 'not_found', message: `No city called ${req.params.slug}` });
      }
      return reply.header('Cache-Control', 'public, max-age=300').send(page);
    },
  );
}
