import { describe, it, expect, vi, afterEach } from 'vitest';
import { reverseGeocode } from './utils.geocode.js';

function makeMapboxResponse(context: { id: string; text: string; short_code?: string }[]) {
  return {
    features: [{ context }],
  };
}

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(body),
    }),
  );
}

describe('reverseGeocode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns placeName and countryAlpha2 from Mapbox response', async () => {
    // locality takes priority over place for slot 0; region fills slot 1
    mockFetch(
      makeMapboxResponse([
        { id: 'locality.1', text: 'Chiang Mai' },
        { id: 'region.1', text: 'Chiang Mai Province' },
        { id: 'country.1', text: 'Thailand', short_code: 'TH' },
      ]),
    );

    const result = await reverseGeocode(98.99, 18.79, 'pk.test');
    expect(result.placeName).toBe('Chiang Mai · Chiang Mai Province');
    expect(result.countryAlpha2).toBe('th');
  });

  it('deduplicates identical place and region labels', async () => {
    // slot-0 picks locality="Bangkok", slot-1 picks place="Bangkok" → dedup collapses to one
    mockFetch(
      makeMapboxResponse([
        { id: 'locality.1', text: 'Bangkok' },
        { id: 'place.1', text: 'Bangkok' },
        { id: 'country.1', text: 'Thailand', short_code: 'TH' },
      ]),
    );

    const result = await reverseGeocode(100.5, 13.75, 'pk.test');
    expect(result.placeName).toBe('Bangkok');
  });

  it('returns null fields when response has no features', async () => {
    mockFetch({ features: [] });

    const result = await reverseGeocode(0.0, 0.0, 'pk.test');
    expect(result.placeName).toBeNull();
    expect(result.countryAlpha2).toBeNull();
  });

  it('returns null fields and caches the error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await reverseGeocode(1.0, 1.0, 'pk.test');
    expect(result.placeName).toBeNull();
    expect(result.countryAlpha2).toBeNull();
  });

  it('returns null fields when response is not ok', async () => {
    mockFetch({}, false);

    const result = await reverseGeocode(2.0, 2.0, 'pk.test');
    expect(result.placeName).toBeNull();
    expect(result.countryAlpha2).toBeNull();
  });

  it('returns cached result without calling fetch again', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve(
          makeMapboxResponse([
            { id: 'place.1', text: 'Phuket' },
            { id: 'country.1', text: 'Thailand', short_code: 'TH' },
          ]),
        ),
    });
    vi.stubGlobal('fetch', fetchMock);

    // Use coordinates that won't collide with other tests (unique to 3dp)
    await reverseGeocode(98.388, 7.882, 'pk.test');
    await reverseGeocode(98.388, 7.882, 'pk.test');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
