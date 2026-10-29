export function dateLocale(lang: string): string {
  return lang === 'th' ? 'th-TH-u-nu-latn' : 'en-GB';
}

export function toDisplayYear(year: number, lang: string): number {
  return lang === 'th' ? year + 543 : year;
}
