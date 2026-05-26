import { describe, it, expect } from 'vitest';
import { pm25ToRgb, pm25ToRgba, pm25ToCategory, contrastColor } from './aqiColors.js';

describe('pm25ToRgb', () => {
  it('Good: 5 µg/m³', () => {
    expect(pm25ToRgb(5)).toEqual([88, 196, 88]);
  });

  it('Moderate: 20 µg/m³', () => {
    expect(pm25ToRgb(20)).toEqual([240, 210, 50]);
  });

  it('Unhealthy for sensitive groups: 40 µg/m³', () => {
    expect(pm25ToRgb(40)).toEqual([255, 126, 0]);
  });

  it('Unhealthy: 100 µg/m³', () => {
    expect(pm25ToRgb(100)).toEqual([255, 0, 0]);
  });

  it('Very unhealthy: 200 µg/m³', () => {
    expect(pm25ToRgb(200)).toEqual([143, 63, 151]);
  });

  it('Hazardous: 300 µg/m³', () => {
    expect(pm25ToRgb(300)).toEqual([126, 0, 35]);
  });

  it('zero maps to Good', () => {
    expect(pm25ToRgb(0)).toEqual([88, 196, 88]);
  });

  it('exactly 12.0 is still Good (EPA boundary inclusive)', () => {
    expect(pm25ToRgb(12.0)).toEqual([88, 196, 88]);
  });

  it('12.1 crosses into Moderate', () => {
    expect(pm25ToRgb(12.1)).toEqual([240, 210, 50]);
  });
});

describe('pm25ToRgba', () => {
  it('appends alpha to the rgb tuple', () => {
    expect(pm25ToRgba(5, 128)).toEqual([88, 196, 88, 128]);
  });
});

describe('pm25ToCategory', () => {
  it('returns Good category for low PM2.5', () => {
    expect(pm25ToCategory(5).key).toBe('aqi.good');
  });

  it('returns Hazardous for very high PM2.5', () => {
    expect(pm25ToCategory(500).key).toBe('aqi.hazardous');
  });
});

describe('contrastColor', () => {
  it('returns white text on a dark background', () => {
    expect(contrastColor([0, 0, 0])).toEqual([255, 255, 255, 255]);
  });

  it('returns black text on a light background', () => {
    expect(contrastColor([255, 255, 255])).toEqual([0, 0, 0, 255]);
  });
});
