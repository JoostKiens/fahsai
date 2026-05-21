interface GeocodeResult {
  placeName: string | null;
  countryAlpha2: string | null;
}

const cache = new Map<string, GeocodeResult>();

export async function reverseGeocode(
  lng: number,
  lat: number,
  accessToken: string,
): Promise<GeocodeResult> {
  const key = `${lng.toFixed(3)},${lat.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
        `?types=locality,place,district&limit=1&access_token=${accessToken}`,
    );
    if (!res.ok) throw new Error('geocode failed');
    const data = (await res.json()) as {
      features?: { context?: { id: string; text: string; short_code?: string }[] }[];
    };
    const context = data.features?.[0]?.context ?? [];
    const pick = (type: string) => context.find((c) => c.id.startsWith(type))?.text;

    const parts = [
      pick('locality') ?? pick('place') ?? pick('district'),
      pick('place') ?? pick('district') ?? pick('region'),
    ]
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, 2);

    const placeName = parts.length ? parts.join(' · ') : null;
    const countryCtx = context.find((c) => c.id.startsWith('country'));
    const countryAlpha2 = countryCtx?.short_code?.toLowerCase() ?? null;

    const result: GeocodeResult = { placeName, countryAlpha2 };
    cache.set(key, result);
    return result;
  } catch {
    const result: GeocodeResult = { placeName: null, countryAlpha2: null };
    cache.set(key, result);
    return result;
  }
}
