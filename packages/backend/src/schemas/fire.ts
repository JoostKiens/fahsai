import { Type } from '@fastify/type-provider-typebox';

export const FirePointSchema = Type.Object({
  id: Type.Integer(),
  detectedAt: Type.String({ description: 'When the satellite saw it, ISO 8601.' }),
  lat: Type.Number(),
  lng: Type.Number(),
  frp: Type.Union([Type.Number(), Type.Null()], { description: 'Fire radiative power, MW.' }),
  confidence: Type.Union([Type.String(), Type.Null()], { description: 'low, nominal or high.' }),
  daynight: Type.Union([Type.String(), Type.Null()], {
    description: 'D or N; only daytime detections are stored.',
  }),
});
