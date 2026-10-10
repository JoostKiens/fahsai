import { describe, it, expect } from 'vitest';
import { baseRadiusForZoom } from './FiresLayer';

describe('baseRadiusForZoom', () => {
  it('clamps to 1 px when zoomed out', () => {
    expect(baseRadiusForZoom(4)).toBe(1);
  });

  it('clamps to 6 px when zoomed in', () => {
    expect(baseRadiusForZoom(14)).toBe(6);
  });

  it('doubles every 1.5 zoom levels between the clamps', () => {
    expect(baseRadiusForZoom(9.5)).toBeCloseTo(2 * baseRadiusForZoom(8));
  });

  it('grows without a jump across zoom 8', () => {
    expect(baseRadiusForZoom(8.2) / baseRadiusForZoom(7.95)).toBeLessThan(1.15);
  });
});
