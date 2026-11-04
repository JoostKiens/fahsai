// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { describe, it, expect } from 'vitest';
import { initialMapView, isStartView } from '@/utils/mapView';
import { placeholderGuardScript } from './placeholderGuard';

// The guard runs in <head>, as plain JavaScript, before anything else: it must say what
// isStartView says for the same link and screen, or the placeholder shows (or hides) wrongly.
function guardLeavesImageOut(search: string, innerWidth: number) {
  let flagged = false;
  runInNewContext(placeholderGuardScript, {
    location: { search },
    innerWidth,
    URLSearchParams,
    document: {
      documentElement: {
        setAttribute: (name: string) => {
          flagged = name === 'data-custom-view';
        },
      },
    },
  });
  return flagged;
}

const SEARCHES = [
  '',
  '?date=2026-11-01',
  '?lat=15.5&lng=101&zoom=5.5',
  '?lat=15.5000&lng=101.0000&zoom=5.50&date=2026-11-03',
  '?lat=13.5000&lng=102.0000&zoom=4.70',
  '?lat=18.8&lng=98.9&zoom=9',
  '?lat=18.8&lng=98.9',
  '?zoom=9',
  '?zoom=2',
  '?zoom=23',
  '?lat=91&lng=100',
  '?lat=15.5&lng=181',
  '?lat=&lng=&zoom=',
  '?lat=15.5abc&lng=101&zoom=5.5',
  '?lat=15.5&lng=101,&zoom=5.5.1',
  '?lat=0&lng=0&zoom=0',
];

describe('placeholder guard script', () => {
  describe.each([412, 767, 768, 1280])('on a screen %d px wide', (width) => {
    it.each(SEARCHES)('agrees with isStartView for %j', (search) => {
      const expected = !isStartView(initialMapView(search, width), width);

      expect(guardLeavesImageOut(search, width)).toBe(expected);
    });
  });

  it('is plain JavaScript with no template placeholders left', () => {
    expect(placeholderGuardScript).not.toMatch(/\$\{|undefined|\[object/);
  });
});
