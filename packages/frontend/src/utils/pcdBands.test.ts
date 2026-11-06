import { describe, it, expect } from 'vitest';
import { contrastColor } from './aqiColors.js';
import { PCD_BANDS, pm25ToPcdBand } from './pcdBands.js';

describe('pm25ToPcdBand', () => {
  it.each([
    [0, 'pcd.excellent'],
    [15.0, 'pcd.excellent'],
    [15.04, 'pcd.excellent'],
    [15.05, 'pcd.satisfactory'],
    [15.1, 'pcd.satisfactory'],
    [25.0, 'pcd.satisfactory'],
    [25.1, 'pcd.moderate'],
    [37.5, 'pcd.moderate'],
    [37.6, 'pcd.unhealthy'],
    [75.0, 'pcd.unhealthy'],
    [75.1, 'pcd.veryUnhealthy'],
    [500, 'pcd.veryUnhealthy'],
  ])('%s µg/m³ is %s', (value, key) => {
    expect(pm25ToPcdBand(value).key).toBe(key);
  });
});

describe('PCD band colours', () => {
  it('use dark text on all five bands', () => {
    for (const band of PCD_BANDS) {
      expect(contrastColor(band.rgb)).toEqual([0, 0, 0, 255]);
    }
  });
});
