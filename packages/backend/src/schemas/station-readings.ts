import { Type } from '@fastify/type-provider-typebox';
import { DateString } from './common.js';

const BaselineStatSchema = Type.Object({
  medianPm25: Type.Number(),
  p25Pm25: Type.Number(),
  p75Pm25: Type.Number(),
  n: Type.Integer({ description: 'How many readings the statistics are based on.' }),
});

export const MeasurementSchema = Type.Object({
  stationId: Type.String(),
  value: Type.Number({ description: 'PM2.5, µg/m³.' }),
  measuredAt: Type.String({ description: 'ISO 8601.' }),
});

export const LatestMeasurementSchema = Type.Object({
  stationId: Type.String(),
  stationName: Type.String(),
  lat: Type.Number(),
  lng: Type.Number(),
  country: Type.Union([Type.String(), Type.Null()]),
  provider: Type.Union([Type.String(), Type.Null()]),
  value: Type.Number({ description: 'PM2.5, µg/m³.' }),
  measuredAt: Type.String({ description: 'ISO 8601.' }),
});

// One Bangkok day of a station: the latest PM2.5 reading, how many readings there were, the weather
// that day and the seasonal baseline for that calendar day. Days without data have pm25 0.
export const StationDayHistorySchema = Type.Object({
  date: DateString,
  pm25: Type.Number({ description: 'The latest reading of the day; 0 when there is none.' }),
  readingCount: Type.Integer(),
  weather: Type.Union([
    Type.Object({
      windSpeedKmh: Type.Union([Type.Number(), Type.Null()]),
      windDirectionDeg: Type.Union([Type.Number(), Type.Null()]),
      precipitationSumMm: Type.Union([Type.Number(), Type.Null()]),
      relativeHumidity2m: Type.Union([Type.Number(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  baseline: Type.Union([BaselineStatSchema, Type.Null()]),
});

export const StationHistoryResponseSchema = Type.Object({
  stationId: Type.String(),
  days: Type.Array(StationDayHistorySchema),
});

export const BaselineResponseSchema = Type.Object({
  data: Type.Array(
    Type.Object({
      month: Type.Integer(),
      day: Type.Integer(),
      ...BaselineStatSchema.properties,
    }),
  ),
  minYear: Type.Union([Type.Integer(), Type.Null()]),
  maxYear: Type.Union([Type.Integer(), Type.Null()]),
});
