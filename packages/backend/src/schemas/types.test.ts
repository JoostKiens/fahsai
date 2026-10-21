import { describe, expectTypeOf, it } from 'vitest';
import type { Static } from '@fastify/type-provider-typebox';
import type {
  ApiError,
  FirePoint,
  PM25DailySummary,
  PM25GridColumns,
  PM25GridPoint,
  PowerPlantCollection,
  Station,
  WeatherReading,
  WindReading,
} from '@thailand-aq/types';
import { ApiErrorSchema } from './common.js';
import { PM25DailySummarySchema, PM25GridColumnsSchema, PM25GridPointSchema } from './aq.js';
import { FirePointSchema } from './fire.js';
import { PowerPlantCollectionSchema } from './power-plant.js';
import { StationSchema } from './station.js';
import { WeatherReadingSchema, WindReadingSchema } from './weather.js';

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

  it('FirePoint', () => {
    expectTypeOf<Static<typeof FirePointSchema>>().toEqualTypeOf<FirePoint>();
  });

  it('WeatherReading and WindReading', () => {
    expectTypeOf<Static<typeof WeatherReadingSchema>>().toEqualTypeOf<WeatherReading>();
    expectTypeOf<Static<typeof WindReadingSchema>>().toEqualTypeOf<WindReading>();
  });

  it('PM25GridPoint, PM25GridColumns and PM25DailySummary', () => {
    expectTypeOf<Static<typeof PM25GridPointSchema>>().toEqualTypeOf<PM25GridPoint>();
    expectTypeOf<Static<typeof PM25GridColumnsSchema>>().toEqualTypeOf<PM25GridColumns>();
    expectTypeOf<Static<typeof PM25DailySummarySchema>>().toEqualTypeOf<PM25DailySummary>();
  });
});
