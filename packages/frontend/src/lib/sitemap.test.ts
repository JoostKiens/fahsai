// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { buildSitemap, fetchCityList } from './sitemap';

describe('buildSitemap', () => {
  it('lists the map in both languages, with their alternates, and each city page', () => {
    const xml = buildSitemap(['chiang-mai', 'bangkok']);

    expect(xml).toContain('<loc>https://fahsai.fyi/</loc>');
    expect(xml).toContain('<loc>https://fahsai.fyi/th/</loc>');
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="th" href="https://fahsai.fyi/th/" />',
    );
    expect(xml).toContain('<loc>https://fahsai.fyi/city</loc>');
    expect(xml).toContain('<loc>https://fahsai.fyi/city/chiang-mai</loc>');
    expect(xml).toContain('<loc>https://fahsai.fyi/city/bangkok</loc>');
  });

  it('lists just the map when there are no cities', () => {
    expect(buildSitemap([]).match(/<url>/g)).toHaveLength(3); // the map twice, and the list of cities
  });

  it('escapes what XML does not allow, so a slug cannot break the file', () => {
    expect(buildSitemap(['a&b<c'])).toContain('/city/a&amp;b&lt;c</loc>');
  });
});

describe('fetchCityList', () => {
  it('returns the cities the API lists', async () => {
    const data = [{ slug: 'bangkok', name: 'Bangkok', country: 'TH' }];
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ data })));

    expect(await fetchCityList({ fetchFn })).toEqual(data);
  });

  it.each([
    ['a server error', () => Promise.resolve(Response.json({}, { status: 500 }))],
    ['a network failure', () => Promise.reject(new Error('down'))],
    ['a body without a list', () => Promise.resolve(Response.json({ hello: 1 }))],
  ])('returns null, and does not throw, on %s', async (_name, answer) => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await fetchCityList({ fetchFn: vi.fn<typeof fetch>(answer) })).toBeNull();
  });
});
