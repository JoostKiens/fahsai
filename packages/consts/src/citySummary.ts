/**
 * The sentences a city page can say about its day, by i18n key. The API sends the key and its
 * numbers; the frontend owns the words (locales/en.json and th.json must have every key).
 */
export const CITY_SENTENCE_KEYS = [
  'city.summary.level',
  'city.summary.fires',
  'city.summary.noFires',
  'city.summary.outsideArea',
  'city.summary.wind',
  'city.summary.baseline.wellAbove',
  'city.summary.baseline.above',
  'city.summary.baseline.below',
  'city.summary.baseline.wellBelow',
] as const;

export type CitySentenceKey = (typeof CITY_SENTENCE_KEYS)[number];
