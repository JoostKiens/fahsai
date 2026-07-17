import { MS_PER_DAY } from '@thailand-aq/consts';

const BKK_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });

// Bangkok (Asia/Bangkok) calendar day (YYYY-MM-DD) for a given instant, defaults to now.
export function bangkokDateString(instant: Date | number = Date.now()): string {
  return BKK_DATE_FORMATTER.format(instant);
}

// Bangkok calendar day (Asia/Bangkok) one day before now — the default ingest jobs target.
export function getYesterdayBkk(): string {
  return bangkokDateString(Date.now() - MS_PER_DAY);
}

// ISO-8601 instant string for Bangkok midnight of a Bangkok calendar day string (YYYY-MM-DD).
// The inverse of bangkokDateString — use this instead of hand-rolling `dateStr + 'T00:00:00+07:00'`
// at call sites that need the boundary as a string (e.g. a Supabase query filter).
export function bangkokMidnightIso(dateStr: string): string {
  return `${dateStr}T00:00:00+07:00`;
}

// UTC instant (epoch ms) of Bangkok midnight for a Bangkok calendar day string (YYYY-MM-DD).
// Use this instead of hand-rolling `Date.UTC(...) - ICT_OFFSET_MS` at call sites that need
// the boundary as a number (e.g. for arithmetic).
export function bangkokMidnightUtcMs(dateStr: string): number {
  return new Date(bangkokMidnightIso(dateStr)).getTime();
}
