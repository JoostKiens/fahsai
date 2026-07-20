export interface BaselineStat {
  medianPm25: number;
  p25Pm25: number;
  p75Pm25: number;
  n: number;
}

export interface BaselineDay extends BaselineStat {
  month: number;
  day: number;
}

export interface BaselineResponse {
  data: BaselineDay[];
  minYear: number | null;
  maxYear: number | null;
}

export const BASELINE_DISPLAY_GATE = 30;

export interface BaselineRow {
  median_pm25: number;
  p25_pm25: number;
  p75_pm25: number;
  n: number;
}

export function mapBaselineRow(row: BaselineRow): BaselineStat {
  return {
    medianPm25: row.median_pm25,
    p25Pm25: row.p25_pm25,
    p75Pm25: row.p75_pm25,
    n: row.n,
  };
}

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
