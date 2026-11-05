// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { CityPage } from '@thailand-aq/types';
import {
  cityJsonLd,
  cityMapLink,
  cityMeta,
  fetchBaselineDiff,
  fetchCityPage,
  formatDay,
  listedStations,
  summaryHtml,
} from './cityPage';

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
  it('describes the breadcrumb, and the page with its place and the day it was updated', () => {
    const [crumbs, webPage] = cityJsonLd(PAGE);

    expect(crumbs).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Fahsai', item: 'https://fahsai.fyi/' },
        { position: 2, name: 'Chiang Mai', item: 'https://fahsai.fyi/city/chiang-mai' },
      ],
    });
    expect(webPage).toMatchObject({
      '@type': 'WebPage',
      url: 'https://fahsai.fyi/city/chiang-mai',
      dateModified: '2026-11-03',
      about: {
        '@type': 'Place',
        name: 'Chiang Mai',
        geo: { latitude: 18.7883, longitude: 98.9853 },
      },
    });
  });

  it('has no Dataset: that is for the methodology page', () => {
    expect(JSON.stringify(cityJsonLd(PAGE))).not.toContain('Dataset');
  });
});

describe('formatDay', () => {
  it('writes the day out in full', () => {
    expect(formatDay('2026-11-04')).toBe('4 Nov 2026');
  });
});

function station(id: string, name: string, pm25: number | null, lat = PAGE.lat, lng = PAGE.lng) {
  return { id, name, lat, lng, pm25, readingCount: pm25 === null ? 0 : 1 };
}

describe('listedStations', () => {
  it('keeps only stations that reported, highest first', () => {
    const page = {
      ...PAGE,
      stations: [station('a', 'A', 10), station('b', 'B', null), station('c', 'C', 30)],
    };

    expect(listedStations(page).map((s) => s.id)).toEqual(['c', 'a']);
  });

  it.each(['', '   ', "' '"])('drops a station whose name has no letter or digit (%j)', (name) => {
    const page = { ...PAGE, stations: [station('a', name, 10), station('b', 'Real', 12)] };

    expect(listedStations(page).map((s) => s.id)).toEqual(['b']);
  });

  it('keeps Thai names', () => {
    const page = { ...PAGE, stations: [station('a', 'สันโป่ง', 10)] };

    expect(listedStations(page)).toHaveLength(1);
  });

  it('gives the distance from the city centre in km, to one decimal, so same-named stations differ', () => {
    // 0.1° of latitude is 11.1 km, 0.2° is 22.2 km
    const page = {
      ...PAGE,
      stations: [
        station('a', 'สันโป่ง', 10, PAGE.lat + 0.1),
        station('b', 'สันโป่ง', 9, PAGE.lat + 0.2),
      ],
    };

    expect(listedStations(page).map((s) => s.distanceKm)).toEqual([11.1, 22.2]);
  });
});

describe('fetchBaselineDiff', () => {
  const withRepresentative = {
    ...PAGE,
    date: '2026-11-03',
    stations: [station('rep', 'Rep', 30)],
    drivers: {
      originInDataArea: true,
      upwindFireCount: 1,
      windSpeedKmh: 5,
      windFrom: 'N',
      camsPm25: 10,
      baselineCategory: 'above' as const,
      representativeStationId: 'rep',
    },
  };
  const baseline = (n: number, medianPm25 = 20) => ({
    data: [{ month: 11, day: 3, medianPm25, p25Pm25: 10, p75Pm25: 25, n }],
  });

  it('is the representative station’s reading against the median for the same day', async () => {
    const fetchFn = respond(baseline(40));

    expect(await fetchBaselineDiff(withRepresentative, { fetchFn })).toEqual({
      station: 'Rep',
      percent: 50,
    });
    expect(urlOf(fetchFn.mock.calls[0][0])).toMatch(/\/stations\/rep\/baseline$/);
  });

  it('is null when the history is too thin to compare with', async () => {
    expect(
      await fetchBaselineDiff(withRepresentative, { fetchFn: respond(baseline(29)) }),
    ).toBeNull();
  });

  it('asks for nothing when the reading is normal for the season', async () => {
    const fetchFn = respond(baseline(40));
    const normal = {
      ...withRepresentative,
      drivers: { ...withRepresentative.drivers, baselineCategory: null },
    };

    expect(await fetchBaselineDiff(normal, { fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('is null, and does not throw, when the API fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await fetchBaselineDiff(withRepresentative, { fetchFn: respond({}, 500) })).toBeNull();
  });
});

describe('summaryHtml', () => {
  const t = ((key: string, params: Record<string, string | number> = {}) =>
    `${key}|${Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')}`) as never;
  const sentence = (key: string, params = {}) => ({ key, params });

  it('puts the day in a <time> element, and the AQI category next to the figure', () => {
    const page = {
      ...PAGE,
      summary: [sentence('city.summary.level', { date: '2026-11-03', pm25: 11 })],
    };

    const [html] = summaryHtml(page, t, null);

    expect(html).toContain('date=<time datetime="2026-11-03">3 Nov 2026</time>');
    expect(html).toContain('category=aqi.moderate');
  });

  it('escapes what the API sends, so a name cannot add markup', () => {
    const page = {
      ...PAGE,
      summary: [sentence('city.summary.wind', { from: '<img src=x>', speed: 5 })],
    };

    expect(summaryHtml(page, t, null)[0]).toContain('from=&lt;img src=x&gt;');
  });

  it('gives the baseline sentence its station and percentage', () => {
    const page = { ...PAGE, summary: [sentence('city.summary.baseline.above')] };

    expect(summaryHtml(page, t, { station: 'Rep', percent: 50 })[0]).toContain(
      'station=Rep,percent=50',
    );
  });

  it('leaves the baseline sentence out when there is no percentage, rather than guess', () => {
    const page = {
      ...PAGE,
      summary: [sentence('city.summary.baseline.above'), sentence('city.summary.noFires')],
    };

    expect(summaryHtml(page, t, null)).toHaveLength(1);
  });
});
