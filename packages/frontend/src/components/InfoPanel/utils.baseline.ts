import type { BaselineStat } from '@thailand-aq/types';

export type BaselineCategory = 'wellAbove' | 'above' | 'normal' | 'below' | 'wellBelow';

export function classifyReading(value: number, bl: BaselineStat): BaselineCategory {
  const iqr = bl.p75Pm25 - bl.p25Pm25;
  if (value > bl.p75Pm25 + iqr) return 'wellAbove';
  if (value > bl.p75Pm25) return 'above';
  if (value >= bl.p25Pm25) return 'normal';
  if (value >= bl.p25Pm25 - iqr) return 'below';
  return 'wellBelow';
}

export type PeriodKey = 'periodEarly' | 'periodMid' | 'periodLate';

export function dateToPeriodKey(dayOfMonth: number): PeriodKey {
  if (dayOfMonth <= 10) return 'periodEarly';
  if (dayOfMonth <= 20) return 'periodMid';
  return 'periodLate';
}
