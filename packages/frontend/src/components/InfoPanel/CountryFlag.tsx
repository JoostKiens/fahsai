export const ISO3_TO_ISO2: Record<string, string> = {
  THA: 'th',
  MMR: 'mm',
  LAO: 'la',
  KHM: 'kh',
  MYS: 'my',
  BGD: 'bd',
  IND: 'in',
  CHN: 'cn',
  BTN: 'bt',
  VNM: 'vn',
};

const ISO2_TO_ISO3: Record<string, string> = Object.fromEntries(
  Object.entries(ISO3_TO_ISO2).map(([k, v]) => [v, k]),
);

/** Convert an ISO 3166-1 alpha-2 code (e.g. "th") to alpha-3 (e.g. "THA"). */
export function alpha2ToIso3(alpha2: string): string | null {
  return ISO2_TO_ISO3[alpha2.toLowerCase()] ?? null;
}

/**
 * The geocoded country wins because it matches the place name shown beside the flag. OpenAQ's
 * stored code is wrong for some border stations, so it is only the fallback while the geocode
 * loads or after it fails.
 */
export function stationCountryIso3(
  storedAlpha2: string | null | undefined,
  geocodedIso3: string | null,
): string | null {
  return geocodedIso3 ?? (storedAlpha2 ? alpha2ToIso3(storedAlpha2) : null);
}

/**
 * Small SVG flag from flagcdn.com (14×10 px, rounded corners, hairline border).
 * Accepts ISO 3166-1 alpha-3 codes (e.g. "THA"). Unknown codes render nothing.
 */
export function CountryFlag({
  iso3,
  className = '',
}: {
  iso3: string | null | undefined;
  className?: string;
}) {
  if (!iso3) return null;
  const cc = ISO3_TO_ISO2[iso3.toUpperCase()];
  if (!cc) return null;
  return (
    <img
      src={`/flags/${cc}.svg`}
      alt=""
      width={14}
      height={10}
      className={`inline-block w-[14px] h-[10px] rounded-[1.5px] shrink-0 ring-1 ring-black/5 object-cover ${className}`}
    />
  );
}
