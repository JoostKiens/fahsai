/**
 * The Redis key of a city page. The UTC hour is in it because the CAMS figure is for the current
 * hour; the newest blend hour because a blend lands at about :50, after most of the hour's pages
 * were built. A build that started before the blend keeps the old key, so it can never write the
 * pre-blend page under the key requests after the blend read. v4: the page gained forecast.
 */
export function cityPageCacheKey(
  slug: string,
  date: string,
  { now, newestBlend }: { now: Date; newestBlend: string | null },
): string {
  const blendHour =
    newestBlend === null ? 'none' : new Date(newestBlend).toISOString().slice(0, 13);
  return `city:v4:${slug}:${date}:${now.toISOString().slice(0, 13)}:b${blendHour}`;
}
