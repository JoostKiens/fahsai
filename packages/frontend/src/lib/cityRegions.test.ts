import { describe, it, expect } from 'vitest';
import { cityRegion, groupByRegion } from './cityRegions';

describe('cityRegion', () => {
  it('knows the northern cities and Bangkok', () => {
    expect(cityRegion('chiang-mai')).toBe('north');
    expect(cityRegion('bangkok')).toBe('central');
  });

  it('puts a city nobody has placed in "other"', () => {
    expect(cityRegion('somewhere')).toBe('other');
  });
});

describe('groupByRegion', () => {
  const cities = [
    { slug: 'bangkok' },
    { slug: 'somewhere' },
    { slug: 'lampang' },
    { slug: 'chiang-mai' },
  ];

  it('groups in a fixed order, keeping the order of the list within a group', () => {
    expect(groupByRegion(cities)).toEqual([
      { region: 'north', cities: [{ slug: 'lampang' }, { slug: 'chiang-mai' }] },
      { region: 'central', cities: [{ slug: 'bangkok' }] },
      { region: 'other', cities: [{ slug: 'somewhere' }] },
    ]);
  });

  it('leaves out a region with no city', () => {
    expect(groupByRegion([{ slug: 'bangkok' }]).map((g) => g.region)).toEqual(['central']);
  });
});
