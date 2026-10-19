import { Type } from '@fastify/type-provider-typebox';

const PowerPlantPropertiesSchema = Type.Object({
  id: Type.Integer(),
  name: Type.String(),
  country: Type.String({ description: 'ISO 3166-1 alpha-3 country code.' }),
  fuel_type: Type.Union([
    Type.Literal('Coal'),
    Type.Literal('Gas'),
    Type.Literal('Oil'),
    Type.Literal('Diesel'),
  ]),
  capacity_mw: Type.Union([Type.Number(), Type.Null()]),
  owner: Type.Union([Type.String(), Type.Null()]),
  commissioned_year: Type.Union([Type.Integer(), Type.Null()]),
});

const PowerPlantFeatureSchema = Type.Object({
  type: Type.Literal('Feature'),
  geometry: Type.Object({
    type: Type.Literal('Point'),
    coordinates: Type.Tuple([Type.Number(), Type.Number()], {
      description: '[longitude, latitude]',
    }),
  }),
  properties: PowerPlantPropertiesSchema,
});

export const PowerPlantCollectionSchema = Type.Object({
  type: Type.Literal('FeatureCollection'),
  features: Type.Array(PowerPlantFeatureSchema),
});
