// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { CityPage } from '@thailand-aq/types';
import {
  cityJsonLd,
  cityBreadcrumbs,
  cityMapLink,
  keyTiles,
  timeHtml,
  cityMeta,
  fetchBaselineDiff,
  fetchCityPage,
  formatDay,
  listedStations,
  summaryHtml,
  trendDays,
} from './cityPage';
import { createI18n } from '@/i18n-instance';

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
    ['a city page missing a field the page reads', respond({ ...PAGE, nearby: undefined })],
    ['a city page whose summary is not a list', respond({ ...PAGE, summary: 'x' })],
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
  const { t } = createI18n('en');

  it('puts the city, the figure and the day in the title and description', () => {
    const meta = cityMeta(PAGE, t);

    expect(meta.title).toContain('Chiang Mai');
    expect(meta.title).toContain('11');
    expect(meta.description).toContain('2026-11-03');
    expect(meta.description).toContain('17 ground stations');
    expect(meta.canonical).toBe('https://fahsai.fyi/city/chiang-mai');
  });

  it('does not say "today": the data is for the newest complete day, which can be yesterday', () => {
    const meta = cityMeta(PAGE, t);

    expect(`${meta.title} ${meta.description}`).not.toMatch(/today/i);
  });

  it('keeps a city with no reading in the index: that is a passing state, not a thin page', () => {
    const meta = cityMeta(NO_DATA, t);

    expect(meta).not.toHaveProperty('noindex');
    expect(meta.title).not.toContain('null');
  });
});

describe('cityJsonLd', () => {
  it('describes the breadcrumb, and the page with its place and the day it was updated', () => {
    const [crumbs, webPage] = cityJsonLd(PAGE, 'T', createI18n('en').t);

    expect(crumbs).toMatchObject({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { position: 1, name: 'Fahsai', item: 'https://fahsai.fyi/' },
        { position: 2, name: 'Cities', item: 'https://fahsai.fyi/city' },
        { position: 3, name: 'Chiang Mai', item: 'https://fahsai.fyi/city/chiang-mai' },
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
    expect(JSON.stringify(cityJsonLd(PAGE, 'T', createI18n('en').t))).not.toContain('Dataset');
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

  it('is null when the station’s name would read as blank', async () => {
    const blank = { ...withRepresentative, stations: [station('rep', "' '", 30)] };

    expect(await fetchBaselineDiff(blank, { fetchFn: respond(baseline(40)) })).toBeNull();
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

  it('puts the day in a <time> element, and the PCD band next to the figure', () => {
    const page = {
      ...PAGE,
      summary: [sentence('city.summary.level', { date: '2026-11-03', pm25: 11 })],
    };

    const [html] = summaryHtml(page, t, null);

    expect(html).toContain('date=<time datetime="2026-11-03">3 Nov 2026</time>');
    expect(html).toContain('category=pcd.excellent');
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

  it.each([
    ['above', -3],
    ['wellAbove', 0],
    ['below', 3],
    ['wellBelow', 0],
  ])('leaves out "%s" when the percentage (%i) does not agree with it', (category, percent) => {
    const page = { ...PAGE, summary: [sentence(`city.summary.baseline.${category}`)] };

    expect(summaryHtml(page, t, { station: 'Rep', percent })).toEqual([]);
  });

  it('keeps "below" when the percentage is negative, and says it without the sign', () => {
    const page = { ...PAGE, summary: [sentence('city.summary.baseline.below')] };

    expect(summaryHtml(page, t, { station: 'Rep', percent: -20 })[0]).toContain('percent=20');
  });

  it('drops a sentence whose key is not plain words, so a key cannot add markup', () => {
    const page = { ...PAGE, summary: [sentence('<b>x</b>')] };

    expect(summaryHtml(page, t, null)).toEqual([]);
  });

  it('leaves the baseline sentence out when there is no percentage, rather than guess', () => {
    const page = {
      ...PAGE,
      summary: [sentence('city.summary.baseline.above'), sentence('city.summary.noFires')],
    };

    expect(summaryHtml(page, t, null)).toHaveLength(1);
  });
});

describe('trendDays', () => {
  it('keeps a day nobody reported as a day without readings', () => {
    const page = {
      ...PAGE,
      trend: [
        { date: '2026-11-02', pm25: null, stationCount: 0 },
        { date: '2026-11-03', pm25: 11, stationCount: 17 },
      ],
    };

    expect(trendDays(page)).toEqual([
      { date: '2026-11-02', pm25: 0, readingCount: 0 },
      { date: '2026-11-03', pm25: 11, readingCount: 17 },
    ]);
  });
});

describe('cityBreadcrumbs', () => {
  it('is Fahsai, the list of cities, then the city: what the structured data lists', () => {
    expect(cityBreadcrumbs(PAGE, createI18n('en').t)).toEqual([
      { name: 'Fahsai', url: 'https://fahsai.fyi/' },
      { name: 'Cities', url: 'https://fahsai.fyi/city' },
      { name: 'Chiang Mai', url: 'https://fahsai.fyi/city/chiang-mai' },
    ]);
  });
});

describe('timeHtml', () => {
  it('writes a day out inside a <time> element that carries the ISO date', () => {
    expect(timeHtml('2026-11-03')).toBe('<time datetime="2026-11-03">3 Nov 2026</time>');
  });
});

describe('summaryHtml baseline period', () => {
  const stubT = ((key: string, params: Record<string, string | number> = {}) =>
    `${key}|${Object.entries(params)
      .map(([k, v]) => `${k}=${v}`)
      .join(',')}`) as never;

  it('says which part of the month the comparison is for, from the page’s day', () => {
    const page = {
      ...PAGE,
      date: '2026-11-03',
      summary: [{ key: 'city.summary.baseline.above', params: {} }],
    };

    const [html] = summaryHtml(page, stubT, { station: 'Rep', percent: 54 });

    expect(html).toContain('period=infoPanel.baseline.periodEarly|month=November');
  });
});

describe('keyTiles', () => {
  const drivers = {
    originInDataArea: true,
    upwindFireCount: 83,
    windSpeedKmh: 3.2,
    windFrom: 'SE',
    camsPm25: 18.4,
    baselineCategory: 'above' as const,
    representativeStationId: 'rep',
  };
  const withDrivers = (overrides = {}) => ({ ...PAGE, drivers: { ...drivers, ...overrides } });

  it('has a tile for each figure that is known', () => {
    expect(keyTiles(withDrivers(), { station: 'Rep', percent: 54 })).toEqual([
      { kind: 'fires', count: 83 },
      { kind: 'wind', from: 'SE', speedKmh: 3, deg: 135 },
      { kind: 'cams', pm25: 18 },
      { kind: 'vsUsual', percent: 54 },
    ]);
  });

  it('leaves out the tile of a figure that is not known, rather than show a blank', () => {
    const tiles = keyTiles(
      withDrivers({ upwindFireCount: null, camsPm25: null, windFrom: null }),
      null,
    );

    expect(tiles).toEqual([]);
  });

  it('keeps a fire count of 0: no detections is a figure', () => {
    expect(keyTiles(withDrivers({ upwindFireCount: 0 }), null)[0]).toEqual({
      kind: 'fires',
      count: 0,
    });
  });

  it('has no tiles when the page has no drivers', () => {
    expect(keyTiles(PAGE, null)).toEqual([]);
  });
});
