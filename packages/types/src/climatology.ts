export interface ClimatologyStat {
  medianPm25: number;
  p25Pm25: number;
  p75Pm25: number;
  n: number;
}

export interface ClimatologyDay extends ClimatologyStat {
  month: number;
  day: number;
}
