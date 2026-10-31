import '@/i18n';
import { describe, it, expect } from 'vitest';
import i18next from 'i18next';
import en from '@/locales/en.json';

// `lib/queryErrors.ts` and `ExplainButton/useExplain.ts` use the default i18next object directly,
// not a React hook, so the browser bootstrap has to initialise that one.
describe('browser i18n bootstrap', () => {
  it('initialises the default i18next instance', () => {
    expect(i18next.language).toBe('en');
  });

  it('translates with the default instance', () => {
    expect(i18next.t('toast.loadFailed')).toBe(en['toast.loadFailed']);
  });
});
