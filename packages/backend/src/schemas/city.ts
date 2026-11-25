import { Type } from '@fastify/type-provider-typebox';
import { WHO_PM25_24H_UGM3 } from '@thailand-aq/consts';
import { DateString } from './common.js';

const NullableNumber = Type.Union([Type.Number(), Type.Null()]);

export const CityListItemSchema = Type.Object({
  slug: Type.String({ description: 'The city’s URL name, for example chiang-mai.' }),
  name: Type.String(),
  country: Type.String({ description: 'ISO 3166-1 alpha-2 country code.' }),
});

const CityStationDaySchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  lat: Type.Number(),
  lng: Type.Number(),
  pm25: Type.Union([Type.Number(), Type.Null()], {
    description: 'The station’s mean PM2.5 for the day (µg/m³); null when it has no reading.',
  }),
  readingCount: Type.Number(),
});

const CityTrendDaySchema = Type.Object({
  date: DateString,
  pm25: Type.Union([Type.Number(), Type.Null()], {
    description: 'The median of the stations’ daily means; null when no station reported.',
  }),
  stationCount: Type.Number(),
});

const CityDriversSchema = Type.Object({
  originInDataArea: Type.Union([Type.Boolean(), Type.Null()], {
    description:
      'False when the air’s path went outside the area the data covers; null when not known.',
  }),
  upwindFireCount: Type.Union([Type.Number(), Type.Null()], {
    description:
      'Fires detected along the path; null when the path left the data area or is not known.',
  }),
  windSpeedKmh: NullableNumber,
  windFrom: Type.Union([Type.String(), Type.Null()], {
    description: 'The compass point the wind came from, for example NNE.',
  }),
  camsPm25: NullableNumber,
  baselineCategory: Type.Union(
    [
      Type.Literal('wellAbove'),
      Type.Literal('above'),
      Type.Literal('below'),
      Type.Literal('wellBelow'),
      Type.Null(),
    ],
    {
      description:
        'How the reading compares with the season; null when normal or the data is thin.',
    },
  ),
  representativeStationId: Type.String(),
});

const CityNearbySchema = Type.Object({
  slug: Type.String(),
  name: Type.String(),
  pm25: NullableNumber,
});

const CitySentenceSchema = Type.Object({
  key: Type.String({ description: 'An i18n key, for example city.summary.level.' }),
  params: Type.Record(Type.String(), Type.Union([Type.String(), Type.Number()]), {
    description: 'The values to put in the sentence.',
  }),
});

const CityNowSchema = Type.Object({
  pm25: Type.Number({ description: 'Mean of the hourly blends over the last 24 h (µg/m³).' }),
  band: Type.Integer({
    minimum: 0,
    maximum: 4,
    description:
      'Thai PCD band, 0 = Excellent to 4 = Very unhealthy. Never better than the band of the stations’ median.',
  }),
  isBandRaised: Type.Boolean({ description: 'The stations’ median raised the band.' }),
  hours: Type.Integer({ description: 'Hourly values in the mean, up to 24.' }),
  latest: Type.Object({
    validAt: Type.String({ description: 'End of the hour (ISO): 12:00 covers 11:00–12:00.' }),
    pm25: Type.Number(),
    stationCount: Type.Integer(),
    stationWeight: Type.Number({
      description: 'The stations’ share of the blend; the rest is CAMS.',
    }),
    camsPm25: NullableNumber,
  }),
});

const CityForecastSchema = Type.Object({
  issuedAt: Type.String({ description: 'The blend hour the forecast is anchored to (ISO).' }),
  factor: Type.Number({ description: 'blend / CAMS for that hour, clamped to 0.5–2.' }),
  days: Type.Array(
    Type.Object({
      date: DateString,
      pm25: Type.Number({ description: 'Mean of the anchored hourly forecast (µg/m³).' }),
      band: Type.Integer({ minimum: 0, maximum: 4, description: 'Thai PCD band of pm25.' }),
      hours: Type.Integer({ description: 'Forecast hours in the mean; today counts those left.' }),
    }),
    { description: 'Today (Bangkok) if any hours are left, then the next days.' },
  ),
});

const CityStationHourSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  pm25: Type.Number(),
  measuredAt: Type.String({ description: 'End of the measured hour (ISO).' }),
});

export const CityPageSchema = Type.Object({
  slug: Type.String(),
  name: Type.String(),
  country: Type.String(),
  lat: Type.Number(),
  lng: Type.Number(),
  zoom: Type.Number({ description: 'The map zoom the “open in map” link uses.' }),
  radiusKm: Type.Number({
    description:
      'The footprint: stations within this distance of the centre (km) count for the city.',
  }),
  date: DateString,
  pm25: Type.Union([Type.Number(), Type.Null()], {
    description:
      'The median of the stations’ daily means, to one decimal (µg/m³); null when no station reported.',
  }),
  stationCount: Type.Number({ description: 'The stations that reported that day.' }),
  stations: Type.Array(CityStationDaySchema, {
    description: 'Every station of the city, nearest first.',
  }),
  trend: Type.Array(CityTrendDaySchema, {
    description: 'The seven days up to and including date, oldest first.',
  }),
  drivers: Type.Union([CityDriversSchema, Type.Null()], {
    description: 'What the day’s trajectory and fires say; null when it could not be computed.',
  }),
  summary: Type.Array(CitySentenceSchema, {
    description:
      'Dated sentences about the day, as i18n keys with values; empty when no station reported.',
  }),
  nearby: Type.Array(CityNearbySchema),
  whoMultiple: Type.Union([Type.Number(), Type.Null()], {
    description: `pm25 divided by the WHO 24-hour guideline (${WHO_PM25_24H_UGM3} µg/m³), to one decimal.`,
  }),
  now: Type.Union([CityNowSchema, Type.Null()], {
    description:
      'A modelled value close to now (stations and CAMS blended hourly); null when there is none yet.',
  }),
  measured: Type.Array(CityStationHourSchema, {
    description: 'Each station’s latest measured hourly value from the last 2 h, nearest first.',
  }),
  forecast: Type.Union([CityForecastSchema, Type.Null()], {
    description:
      'CAMS scaled to the latest hourly blend (a model estimate), issued in the last 2 h; null when there is none.',
  }),
});
