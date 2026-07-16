import { describe, it, expect } from 'vitest';
import { compassFromDeg } from './geo.js';

describe('compassFromDeg (16-point)', () => {
  it('returns N for 0°', () => {
    expect(compassFromDeg(0)).toBe('N');
  });

  it('returns E for 90°', () => {
    expect(compassFromDeg(90)).toBe('E');
  });

  it('returns S for 180°', () => {
    expect(compassFromDeg(180)).toBe('S');
  });

  it('returns W for 270°', () => {
    expect(compassFromDeg(270)).toBe('W');
  });

  it('returns NE for 45°', () => {
    expect(compassFromDeg(45)).toBe('NE');
  });

  it('returns NNW for 340° (centre of NNW sector)', () => {
    expect(compassFromDeg(340)).toBe('NNW');
  });

  it('wraps 360° back to N', () => {
    expect(compassFromDeg(360)).toBe('N');
  });

  it('handles negative degrees: −90° → W', () => {
    expect(compassFromDeg(-90)).toBe('W');
  });
});
