// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { cityIndexJsonLd, fetchCityIndex } from './cityIndex';

const LIST = [
  { slug: 'bangkok', name: 'Bangkok', country: 'TH' },
  { slug: 'lampang', name: 'Lampang', country: 'TH' },
];

function page(slug: string, pm25: number | null) {
  return {
    slug,
    name: slug,
    country: 'TH',
    lat: 1,
    lng: 2,
    zoom: 9,
    date: '2026-11-04',
    pm25,
    stationCount: 1,
    stations: [],
    trend: [],
    drivers: null,
    summary: [],
    nearby: [],
    whoMultiple: null,
  };
}

function fakeFetch(answers: Record<string, () => Response>) {
  return vi.fn<typeof fetch>((input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = Object.keys(answers).find((k) => url.endsWith(k));
    return Promise.resolve(key ? answers[key]() : new Response(null, { status: 500 }));
  });
}

describe('fetchCityIndex', () => {
  it('gives each city its latest figure', async () => {
    const fetchFn = fakeFetch({
      '/cities': () => Response.json({ data: LIST }),
      '/cities/bangkok': () => Response.json(page('bangkok', 22)),
      '/cities/lampang': () => Response.json(page('lampang', null)),
    });

    expect(await fetchCityIndex({ fetchFn })).toEqual([
      { ...LIST[0], pm25: 22 },
      { ...LIST[1], pm25: null },
    ]);
  });

  it('keeps a city whose page cannot be read, without a figure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchFn = fakeFetch({
      '/cities': () => Response.json({ data: LIST }),
      '/cities/bangkok': () => Response.json(page('bangkok', 22)),
    });

    const index = await fetchCityIndex({ fetchFn });

    expect(index?.map((c) => c.pm25)).toEqual([22, null]);
  });

  it('is null when the list cannot be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await fetchCityIndex({ fetchFn: fakeFetch({}) })).toBeNull();
  });
});

describe('cityIndexJsonLd', () => {
  it('is the trail Fahsai, Cities', () => {
    expect(JSON.stringify(cityIndexJsonLd())).toContain('https://fahsai.fyi/city');
  });
});
