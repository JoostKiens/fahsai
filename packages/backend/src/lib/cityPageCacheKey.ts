// The CAMS figure and the hourly value change every hour, so a page is cached per hour. v4: the page
// gained forecast. The hourly job deletes the key once its blend is stored (refreshCityPages.ts).
export function cityPageCacheKey(slug: string, date: string, now: Date): string {
  return `city:v4:${slug}:${date}:${now.toISOString().slice(0, 13)}`;
}
