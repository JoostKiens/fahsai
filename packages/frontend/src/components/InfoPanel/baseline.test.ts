import { describe, it, expect } from 'vitest';
import { classifyReading, dateToPeriodKey } from './baseline';
import type { BaselineStat } from '@thailand-aq/types';

const bl: BaselineStat = { p25Pm25: 20, p75Pm25: 40, medianPm25: 30, n: 100 };
// IQR = 40 - 20 = 20

describe('classifyReading', () => {
  it('returns wellAbove when value exceeds p75 + IQR', () => {
    expect(classifyReading(61, bl)).toBe('wellAbove');
  });

  it('returns above when value exceeds p75 but within IQR above', () => {
    expect(classifyReading(50, bl)).toBe('above');
  });

  it('returns normal when value is between p25 and p75', () => {
    expect(classifyReading(30, bl)).toBe('normal');
  });

  it('returns below when value is below p25 but within IQR below', () => {
    expect(classifyReading(10, bl)).toBe('below');
  });

  it('returns wellBelow when value is below p25 - IQR', () => {
    expect(classifyReading(-1, bl)).toBe('wellBelow');
  });

  it('returns normal at exact p25 boundary', () => {
    expect(classifyReading(20, bl)).toBe('normal');
  });

  it('returns above at exact p75 boundary + epsilon', () => {
    expect(classifyReading(40.1, bl)).toBe('above');
  });

  it('returns normal at exact p75 boundary', () => {
    expect(classifyReading(40, bl)).toBe('normal');
  });

  it('returns below at exact p25 - IQR boundary', () => {
    expect(classifyReading(0, bl)).toBe('below');
  });

  it('returns wellAbove at exact p75 + IQR boundary + epsilon', () => {
    expect(classifyReading(60.1, bl)).toBe('wellAbove');
  });

  it('handles zero IQR (p25 === p75)', () => {
    const flat: BaselineStat = { p25Pm25: 30, p75Pm25: 30, medianPm25: 30, n: 50 };
    expect(classifyReading(30, flat)).toBe('normal');
    expect(classifyReading(30.1, flat)).toBe('wellAbove');
    expect(classifyReading(29.9, flat)).toBe('wellBelow');
  });
});

describe('dateToPeriodKey', () => {
  it('returns periodEarly for days 1-10', () => {
    expect(dateToPeriodKey(1)).toBe('periodEarly');
    expect(dateToPeriodKey(10)).toBe('periodEarly');
  });

  it('returns periodMid for days 11-20', () => {
    expect(dateToPeriodKey(11)).toBe('periodMid');
    expect(dateToPeriodKey(20)).toBe('periodMid');
  });

  it('returns periodLate for days 21-31', () => {
    expect(dateToPeriodKey(21)).toBe('periodLate');
    expect(dateToPeriodKey(31)).toBe('periodLate');
  });
});
