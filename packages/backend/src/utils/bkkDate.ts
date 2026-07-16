const BKK_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' });

// Bangkok (Asia/Bangkok) calendar day (YYYY-MM-DD) for a given instant, defaults to now.
export function bangkokDateString(instant: Date | number = Date.now()): string {
  return BKK_DATE_FORMATTER.format(instant);
}
