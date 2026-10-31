import { describe, it, expect } from 'vitest';
import { languageSwitchUrl } from './languageSwitchUrl';

describe('languageSwitchUrl', () => {
  it('goes through the redirect at / with the chosen language', () => {
    expect(languageSwitchUrl('th', '')).toBe('/?lang=th');
    expect(languageSwitchUrl('en', '')).toBe('/?lang=en');
  });

  it('carries the map position, date and selection along', () => {
    expect(
      languageSwitchUrl('en', '?lat=15.5&lng=101&zoom=5.5&date=2026-10-20&sel=station%3A6123215'),
    ).toBe('/?lang=en&lat=15.5&lng=101&zoom=5.5&date=2026-10-20&sel=station%3A6123215');
  });

  it('replaces a language already in the query', () => {
    expect(languageSwitchUrl('th', '?lang=en&zoom=5')).toBe('/?lang=th&zoom=5');
  });
});
