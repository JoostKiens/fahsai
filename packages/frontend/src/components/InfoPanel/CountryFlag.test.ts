import { describe, it, expect } from 'vitest';
import { stationCountryIso3 } from './CountryFlag';

describe('stationCountryIso3', () => {
  it('prefers the geocoded country when the stored country disagrees', () => {
    // Chalermprakiet Hospital (225581): OpenAQ says LA, the station is in Nan, Thailand.
    expect(stationCountryIso3('LA', 'THA')).toBe('THA');
  });

  it('falls back to the stored country while the geocode is missing', () => {
    expect(stationCountryIso3('TH', null)).toBe('THA');
  });

  it('returns null when neither country is known', () => {
    expect(stationCountryIso3(null, null)).toBeNull();
  });
});
