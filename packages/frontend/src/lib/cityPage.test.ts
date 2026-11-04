// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { CityPage } from '@thailand-aq/types';
import { cityJsonLd, cityMapLink, cityMeta, fetchCityPage } from './cityPage';

const PAGE: CityPage = {
  slug: 'chiang-mai',
  name: 'Chiang Mai',
  country: 'TH',
  lat: 18.7883,
  lng: 98.9853,
  zoom: 10,
  date: '2026-11-03',
  pm25: 11,
  stationCount: 17,
  stations: [],
  trend: [],
  drivers: null,
  summary: [],
  nearby: [],
  whoMultiple: 0.7,
};
const NO_DATA: CityPage = { ...PAGE, pm25: null, whoMultiple: null, stationCount: 0 };

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { status })));
}

describe('fetchCityPage', () => {
  it('returns the page the API answers with', async () => {
    const fetchFn = respond(PAGE);

    const result = await fetchCityPage('chiang-mai', { fetchFn });

    expect(result).toEqual({ status: 'ok', page: PAGE });
    expect(urlOf(fetchFn.mock.calls[0][0])).toMatch(/\/cities\/chiang-mai$/);
  });

  it('escapes the slug, so a crafted path cannot reach another API route', async () => {
    const fetchFn = respond(PAGE);

    await fetchCityPage('../fires?x=1', { fetchFn });

    expect(urlOf(fetchFn.mock.calls[0][0])).toMatch(/\/cities\/\.\.%2Ffires%3Fx%3D1$/);
  });

  it('says not-found for an unknown city', async () => {
    expect(await fetchCityPage('atlantis', { fetchFn: respond({}, 404) })).toEqual({
      status: 'not-found',
    });
  });

  it.each([
    ['a server error', respond({}, 500)],
    ['a network failure', vi.fn<typeof fetch>(() => Promise.reject(new Error('down')))],
    ['a body that is not a city page', respond({ hello: 'world' })],
  ])('says unavailable, and does not throw, on %s', async (_name, fetchFn) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await fetchCityPage('chiang-mai', { fetchFn })).toEqual({ status: 'unavailable' });
  });
});

describe('cityMapLink', () => {
  it('opens the map on the city and the page’s day', () => {
    expect(cityMapLink(PAGE)).toBe('/?lat=18.7883&lng=98.9853&zoom=10&date=2026-11-03');
  });
});

describe('cityMeta', () => {
  it('puts the city, the figure and the day in the title and description', () => {
    const meta = cityMeta(PAGE);

    expect(meta.title).toContain('Chiang Mai');
    expect(meta.title).toContain('11');
    expect(meta.description).toContain('2026-11-03');
    expect(meta.description).toContain('17 ground stations');
    expect(meta.canonical).toBe('https://fahsai.fyi/city/chiang-mai');
    expect(meta.noindex).toBe(false);
  });

  it('keeps a page without a reading out of the index', () => {
    const meta = cityMeta(NO_DATA);

    expect(meta.noindex).toBe(true);
    expect(meta.title).not.toContain('null');
  });
});

describe('cityJsonLd', () => {
  it('describes the breadcrumb and the dataset, both pointing at the canonical address', () => {
    const [crumbs, dataset] = cityJsonLd(PAGE);

    expect(crumbs).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Fahsai', item: 'https://fahsai.fyi/' },
        { position: 2, name: 'Chiang Mai', item: 'https://fahsai.fyi/city/chiang-mai' },
      ],
    });
    expect(dataset).toMatchObject({
      '@type': 'Dataset',
      url: 'https://fahsai.fyi/city/chiang-mai',
      spatialCoverage: { geo: { latitude: 18.7883, longitude: 98.9853 } },
    });
  });
});
