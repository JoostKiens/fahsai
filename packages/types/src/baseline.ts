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
