import { Type } from '@fastify/type-provider-typebox';
import { DateString } from './common.js';

// Mirrors ExplainCase in routes/explain.ts; schemas/types.test.ts checks they stay equal.
export const EXPLAIN_CASES = [
  'OUTLIER_HIGH',
  'OUTLIER_LOW',
  'PLAUSIBLE_FIRE_TRANSPORT',
  'PLAUSIBLE_URBAN_INDUSTRIAL',
  'PLAUSIBLE_CLEAN',
  'PLAUSIBLE_REGIONAL_BACKGROUND',
  'PLAUSIBLE_UNCLEAR',
] as const;

const nullable = <T extends ReturnType<typeof Type.Number | typeof Type.String>>(schema: T) =>
  Type.Union([schema, Type.Null()]);

const TierSourceSchema = Type.Object({
  name: Type.String(),
  country: Type.String({ description: 'ISO 3166-1 alpha-2.' }),
  distanceKm: Type.Number(),
  type: Type.Enum(['city', 'coal_plant', 'gas_plant', 'oil_plant', 'industrial'] as const),
  population: Type.Optional(Type.Number({ description: 'For cities.' })),
  capacityMw: Type.Optional(Type.Number({ description: 'For power plants.' })),
  currentlyUpwind: Type.Boolean({ description: 'Whether the wind blows from the source now.' }),
});

const FireWindowSchema = Type.Object({ count: Type.Number(), totalFrpMw: Type.Number() });

// Everything GET /api/explain/context returns: the scientific facts behind an explanation. The
// published fahsai-mcp-server reads this, so a rename or removal is a breaking change for it (see
// docs/claude/explain.md). schemas/types.test.ts checks this equals ScientificContext.
export const ScientificContextSchema = Type.Object({
  station: Type.Object({ name: Type.String(), lat: Type.Number(), lng: Type.Number() }),
  currentPm25: Type.Number(),
  aqiCategory: Type.String(),
  explainCase: Type.Enum(EXPLAIN_CASES),
  date: DateString,
  sevenDayAverages: Type.Array(
    Type.Object({ date: DateString, value: Type.Number(), category: Type.String() }),
  ),
  wind: Type.Object({
    days: Type.Array(
      Type.Object({ date: DateString, directionLabel: Type.String(), speedKmh: Type.Number() }),
      { description: 'Only days with wind data, newest first, up to 3.' },
    ),
  }),
  weatherContext: Type.Object({
    days: Type.Array(
      Type.Object({
        date: DateString,
        precipitationMm: Type.Number(),
        humidity: nullable(Type.Number()),
        highHumidityWarning: Type.Boolean(),
      }),
    ),
    totalPrecipitationMm: Type.Number(),
    trajectoryPrecipitationMm: Type.Number(),
    availableDayCount: Type.Number(),
  }),
  persistentWind: Type.Union([
    Type.Object({
      label: Type.String(),
      dayCount: Type.Number(),
      sourcesBeyondWindow: Type.Array(TierSourceSchema),
    }),
    Type.Null(),
  ]),
  transport: Type.Union(
    [
      Type.Object({
        trajectory: Type.Object({
          hoursTraced: Type.Number(),
          origin: Type.Object({
            lat: Type.Number(),
            lng: Type.Number(),
            region: Type.String(),
            date: DateString,
          }),
          corridorWidthKm: Type.Number(),
          meanWindSpeedKmh: Type.Number(),
          waypoints: Type.Array(
            Type.Object({ lat: Type.Number(), lng: Type.Number(), region: Type.String() }),
          ),
          originIsWater: Type.Boolean(),
        }),
        cams: Type.Object({
          samples: Type.Array(
            Type.Object({
              lat: Type.Number(),
              lng: Type.Number(),
              date: DateString,
              pm25: Type.Number(),
              category: Type.String(),
            }),
          ),
          maxPm25: nullable(Type.Number()),
          suppressionActive: Type.Boolean(),
          stationExceedsCamsMax: Type.Boolean({
            description: 'True when the station exceeds the peak modelled value by over 20 µg/m³.',
          }),
        }),
        fire: Type.Object({
          pathScore: Type.Number(),
          pathFireCount: Type.Number(),
          recency: Type.Union([
            Type.Object({
              last24h: FireWindowSchema,
              last48h: FireWindowSchema,
              last72h: FireWindowSchema,
            }),
            Type.Null(),
          ]),
          nearestFireDistKm: nullable(Type.Number()),
          areaScore: Type.Number(),
          areaFireCount: nullable(Type.Number()),
          areaTotalFrpMw: nullable(Type.Number()),
          firesAreLocal: Type.Boolean(),
          areaFireRadiusKm: Type.Number(),
        }),
      }),
      Type.Null(),
    ],
    { description: 'Null for outlier cases, where transport is not relevant.' },
  ),
  upwindSources: Type.Object({
    tier1: Type.Array(TierSourceSchema),
    tier2: Type.Array(TierSourceSchema),
  }),
  areaFirePressure: Type.Union([
    Type.Object({
      score: Type.Number(),
      fireCount: nullable(Type.Number()),
      totalFrpMw: nullable(Type.Number()),
    }),
    Type.Null(),
  ]),
  trend: Type.Union([
    Type.Object({
      direction: Type.Enum(['rising', 'falling', 'stable'] as const),
      isSignificant: Type.Boolean(),
    }),
    Type.Null(),
  ]),
  peers: Type.Union([
    Type.Object({
      stationCount: Type.Number(),
      weightedMean: Type.Number(),
      unweightedMedian: Type.Number(),
      range: Type.Union([Type.Object({ min: Type.Number(), max: Type.Number() }), Type.Null()]),
      distribution: nullable(Type.String()),
      stations: Type.Array(
        Type.Object({ name: Type.String(), value: Type.Number(), distanceKm: Type.Number() }),
      ),
    }),
    Type.Null(),
  ]),
  outlier: Type.Union([
    Type.Object({
      type: Type.Literal('HIGH'),
      ratio: Type.Number(),
      peerTier: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)]),
    }),
    Type.Object({ type: Type.Literal('LOW'), ratio: Type.Number() }),
    Type.Null(),
  ]),
  seasonContext: Type.String(),
  stationBaseline: Type.Union([
    Type.Object({
      category: Type.Enum(['wellAbove', 'above', 'below', 'wellBelow'] as const),
      typicalLow: Type.Number(),
      typicalHigh: Type.Number(),
      periodLabel: Type.String(),
    }),
    Type.Null(),
  ]),
});

export const ExplainRequestSchema = Type.Object({
  stationId: Type.String({ minLength: 1 }),
  lat: Type.Number(),
  lng: Type.Number(),
  date: Type.Optional(DateString),
  lang: Type.Optional(Type.String({ description: 'The explanation language, en or th.' })),
});
