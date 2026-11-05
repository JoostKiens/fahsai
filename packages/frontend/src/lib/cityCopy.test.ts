import { describe, it, expect } from 'vitest';
import { cityCopyGroup } from './cityCopy';

describe('cityCopyGroup', () => {
  it.each(['chiang-mai', 'chiang-rai', 'lampang', 'lamphun'])(
    'puts the northern valley city %s in one group',
    (slug) => {
      expect(cityCopyGroup(slug)).toBe('northernValley');
    },
  );

  it('has no text yet for a city outside the groups', () => {
    expect(cityCopyGroup('bangkok')).toBeNull();
  });
});
