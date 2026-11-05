import { describe, it, expect } from 'vitest';
import { CITY_SENTENCE_KEYS } from '@thailand-aq/consts';
import en from '@/locales/en.json';
import th from '@/locales/th.json';

const locales = { en, th } as Record<string, Record<string, string>>;

describe('city summary sentences', () => {
  it.each(Object.keys(locales))('%s has every sentence the API can send', (lang) => {
    expect(CITY_SENTENCE_KEYS.filter((key) => !(key in locales[lang]))).toEqual([]);
  });

  // The wording rules in docs/claude/explain.md that a regular expression can check
  describe.each(CITY_SENTENCE_KEYS)('%s (en)', (key) => {
    const text = en[key as keyof typeof en];

    it('names no country', () => {
      expect(text).not.toMatch(/myanmar|burma|laos|cambodia|vietnam|china|india|malaysia/i);
    });

    it('states no time window', () => {
      expect(text).not.toMatch(/\b\d+\s*(hours?|days?|weeks?|h)\b|recently|past few/i);
    });

    it('has no em-dash and no CAMS model value', () => {
      expect(text).not.toMatch(/—|CAMS/);
    });
  });

  it('says fires "have been detected", never that they are burning', () => {
    expect(en['city.summary.fires']).toMatch(/have been detected/);
    expect(en['city.summary.noFires']).toMatch(/have been detected/);
    expect(Object.values(en).join('\n')).not.toMatch(/are burning|is burning|burning now/i);
  });

  // The regional text under each city page: the same rules, and it claims no cause for a place
  describe.each(Object.keys(en).filter((key) => key.startsWith('city.why.')))('%s (en)', (key) => {
    const text = en[key as keyof typeof en];

    it('names no country and blames no sector', () => {
      expect(text).not.toMatch(
        /myanmar|burma|laos|cambodia|vietnam|china|india|malaysia|agricultur|farm|crop|forest burning/i,
      );
    });

    it('states no time window and has no em-dash', () => {
      expect(text).not.toMatch(/\b\d+\s*(hours?|days?|weeks?|h)\b|recently|past few|—/i);
    });
  });
});
