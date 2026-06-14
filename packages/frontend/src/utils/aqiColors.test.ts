import { describe, it, expect } from 'vitest';
import {
  pm25ToRgb,
  pm25ToRgba,
  pm25ToCategory,
  contrastColor,
  pm25ToRgbLerped,
} from './aqiColors.js';

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

describe('pm25ToRgbLerped', () => {
  it('zero returns Good color exactly', () => {
    expect(pm25ToRgbLerped(0)).toEqual([88, 196, 88]);
  });

  it('at or above 250.4 returns Hazardous color exactly', () => {
    expect(pm25ToRgbLerped(250.4)).toEqual([126, 0, 35]);
    expect(pm25ToRgbLerped(999)).toEqual([126, 0, 35]);
  });

  it('midpoint of Good band lerps halfway to Moderate', () => {
    // Good: 0–12, Moderate: 12–35.4. Midpoint at 6 µg/m³ → t = 0.5
    const [r, g, b] = pm25ToRgbLerped(6);
    expect(r).toBe(Math.round(88 + 0.5 * (240 - 88)));
    expect(g).toBe(Math.round(196 + 0.5 * (210 - 196)));
    expect(b).toBe(Math.round(88 + 0.5 * (50 - 88)));
  });

  it('at band boundary 12.0 returns Moderate color (t=1 of Good band)', () => {
    // 12.0 is the upper bound of the Good band → t=1 → fully Moderate
    expect(pm25ToRgbLerped(12.0)).toEqual([240, 210, 50]);
  });

  it('produces a value between adjacent category colors mid-band', () => {
    // 23.7 is ~midpoint of Moderate band (12–35.4); lerps toward Unhealthy Sensitive [255,126,0]
    const [, g] = pm25ToRgbLerped(23.7);
    expect(g).toBeGreaterThan(126); // above Unhealthy Sensitive green
    expect(g).toBeLessThan(210); // below Moderate green
  });
});
