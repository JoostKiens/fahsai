import type { BaselineCategory, CityPage, CitySentence } from '@thailand-aq/types';
import type { CitySentenceKey } from '@thailand-aq/consts';

type SummaryInput = Pick<
  CityPage,
  'name' | 'date' | 'pm25' | 'stationCount' | 'whoMultiple' | 'drivers'
>;

// every category but 'normal' has a sentence: a new one fails to compile here
const BASELINE_KEYS: Record<Exclude<BaselineCategory, 'normal'>, CitySentenceKey> = {
  wellAbove: 'city.summary.baseline.wellAbove',
  above: 'city.summary.baseline.above',
  below: 'city.summary.baseline.below',
  wellBelow: 'city.summary.baseline.wellBelow',
};

function sentence(key: CitySentenceKey, params: CitySentence['params']): CitySentence {
  return { key, params };
}

/**
 * The sentences about a city's day, as i18n keys with numbers. They state what was measured and
 * detected, never a place or a culprit (docs/claude/explain.md has the wording rules the frontend's
 * words follow): the params are only numbers, the city, the date and a compass point.
 */
export function citySummary(page: SummaryInput): CitySentence[] {
  if (page.pm25 === null || page.whoMultiple === null) return [];
  const { drivers } = page;
  const sentences = [
    sentence('city.summary.level', {
      city: page.name,
      date: page.date,
      pm25: page.pm25,
      count: page.stationCount,
      multiple: page.whoMultiple,
    }),
  ];
  if (!drivers) return sentences;

  if (drivers.originInDataArea === false) {
    sentences.push(sentence('city.summary.outsideArea', {}));
  } else if (drivers.originInDataArea === true && drivers.upwindFireCount !== null) {
    sentences.push(
      drivers.upwindFireCount > 0
        ? sentence('city.summary.fires', { count: drivers.upwindFireCount })
        : sentence('city.summary.noFires', {}),
    );
  }
  if (drivers.windFrom !== null && drivers.windSpeedKmh !== null) {
    sentences.push(
      sentence('city.summary.wind', {
        from: drivers.windFrom,
        speed: Math.round(drivers.windSpeedKmh),
      }),
    );
  }
  if (drivers.baselineCategory !== null) {
    sentences.push(sentence(BASELINE_KEYS[drivers.baselineCategory], {}));
  }
  return sentences;
}
