import { describe, it, expect } from 'vitest';
import { searchWithoutLang } from './langParam';

describe('searchWithoutLang', () => {
  it.each([
    ['', ''],
    ['?', ''],
    ['?lang=th', ''],
    ['?lang', ''],
    ['?lang=th&lang=en', ''],
    ['?lang=th&zoom=5', '?zoom=5'],
    ['?zoom=5&lang=th&date=2026-10-20', '?zoom=5&date=2026-10-20'],
    ['?sel=station:1&lang=en', '?sel=station:1'],
    ['?sel=station%3A1', '?sel=station%3A1'],
    ['?%6Cang=th&zoom=5', '?zoom=5'],
    ['?Lang=th', '?Lang=th'],
    ['?language=th', '?language=th'],
    ['?a=1&&b=2', '?a=1&b=2'],
    ['?q=a%20b&lang=th', '?q=a%20b'],
  ])('%j becomes %j', (search, expected) => {
    expect(searchWithoutLang(search)).toBe(expected);
  });
});
