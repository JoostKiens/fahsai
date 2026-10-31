import { StrictMode, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import type { i18n } from 'i18next';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { createI18n } from '@/i18n-instance';
import type { Language } from '@/store/settingsStore';

interface Props {
  /** The page's language, so the server and the browser render the same text */
  lang: Language;
  /** Names the island in error reports */
  name: string;
  /** Shown in the island's place if it throws; the other islands keep running */
  fallback: ReactNode;
  children: ReactNode;
}

const instances = new Map<Language, i18n>();

function i18nFor(lang: Language): i18n {
  const existing = instances.get(lang);
  if (existing) return existing;
  const created = createI18n(lang);
  instances.set(lang, created);
  return created;
}

/**
 * What an island wraps itself in when Astro renders it on the server and hydrates it in the
 * browser (`client:load`). Unlike `IslandRoot` it never imports `@/i18n`, which reads `window`: the
 * language comes from the `lang` prop, through a provider.
 */
export function ServerIslandRoot({ lang, name, fallback, children }: Props) {
  return (
    <StrictMode>
      <I18nextProvider i18n={i18nFor(lang)}>
        <ErrorBoundary name={name} fallback={fallback}>
          {children}
        </ErrorBoundary>
      </I18nextProvider>
    </StrictMode>
  );
}
