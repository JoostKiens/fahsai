import { describe, it, expect } from 'vitest';
import { parseBbox } from '../utils/bbox.js';
import { CITIES, findCity } from './cities.js';

describe('the city registry', () => {
  it('has unique, lowercase, hyphenated slugs', () => {
    const slugs = CITIES.map((city) => city.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it.each(CITIES.map((city) => [city.slug, city] as const))(
    'puts %s inside the area the app covers, with a usable map zoom',
    (_slug, city) => {
      const { west, south, east, north } = parseBbox(undefined);

      expect(city.lng).toBeGreaterThan(west);
      expect(city.lng).toBeLessThan(east);
      expect(city.lat).toBeGreaterThan(south);
      expect(city.lat).toBeLessThan(north);
      expect(city.zoom).toBeGreaterThanOrEqual(4);
      expect(city.zoom).toBeLessThanOrEqual(22);
      expect(city.name.trim()).not.toBe('');
      expect(city.country).toMatch(/^[A-Z]{2}$/);
    },
  );

  it('does not both include and exclude the same station', () => {
    for (const city of CITIES) {
      const overlap = (city.include ?? []).filter((id) => (city.exclude ?? []).includes(id));
      expect(overlap, city.slug).toEqual([]);
    }
  });

  it('finds a city by slug, and nothing for an unknown one', () => {
    expect(findCity('chiang-mai')?.name).toBe('Chiang Mai');
    expect(findCity('atlantis')).toBeUndefined();
  });
});
