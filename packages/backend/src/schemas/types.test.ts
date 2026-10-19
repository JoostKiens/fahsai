import { describe, expectTypeOf, it } from 'vitest';
import type { Static } from '@fastify/type-provider-typebox';
import type { ApiError, PowerPlantCollection, Station } from '@thailand-aq/types';
import { ApiErrorSchema } from './common.js';
import { PowerPlantCollectionSchema } from './power-plant.js';
import { StationSchema } from './station.js';

// Checked by the compiler (pnpm typecheck), not at runtime: each schema must describe exactly the
// type that packages/types shares with the frontend. A field added to one and not the other fails here.
describe('schemas match the shared types', () => {
  it('Station', () => {
    expectTypeOf<Static<typeof StationSchema>>().toEqualTypeOf<Station>();
  });

  it('PowerPlantCollection', () => {
    expectTypeOf<Static<typeof PowerPlantCollectionSchema>>().toEqualTypeOf<PowerPlantCollection>();
  });

  it('ApiError', () => {
    expectTypeOf<Static<typeof ApiErrorSchema>>().toEqualTypeOf<ApiError>();
  });
});
