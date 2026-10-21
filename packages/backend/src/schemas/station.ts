import { Type } from '@fastify/type-provider-typebox';

export const StationSchema = Type.Object({
  id: Type.String({ description: 'The station id (OpenAQ location id).' }),
  name: Type.String(),
  lat: Type.Number(),
  lng: Type.Number(),
  country: Type.String({ description: 'ISO country code; empty when unknown.' }),
  provider: Type.Union([Type.String(), Type.Null()], {
    description: 'The data provider, if known.',
  }),
});
