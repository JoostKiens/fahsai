# ADR 0002 — i18n architecture: Thai language support

**Date:** 2026-05-21  
**Status:** Accepted

## Context

Fahsai added a language switcher (EN/TH) to the header. Implementing it required three
non-obvious architectural choices that would otherwise look arbitrary to a future reader.

## Decisions

### 1. Language preference stored in `settingsStore`, not in i18next's own localStorage key

`i18next-browser-languagedetector` writes to a separate `i18nextLng` localStorage key by
default. Fahsai instead stores `language: 'en' | 'th'` in the existing Zustand `settingsStore`
(under `taqm:settings`, schema version 2), and passes the stored value to `i18next.init()` on
boot.

**Why:** All user preferences live in one versioned, migratable store. Splitting language into a
second key would make `settingsStore` an incomplete picture of user preferences and bypass its
migrate/version machinery.

**Tradeoff accepted:** `i18next-browser-languagedetector` is still installed and used *only* for
the very first visit (before the user has ever made an explicit choice and `settingsStore` has no
`language` value). After the first explicit selection, `settingsStore` owns the value.

### 2. Thai date formatting uses `'th-TH-u-ca-gregory-nu-latn'`

All `toLocaleString` / `toLocaleDateString` calls accept a locale string. When Thai is active
the locale `'th-TH-u-ca-gregory-nu-latn'` is used instead of `'en-GB'`.

**Why:** Plain `'th-TH'` produces Thai numerals (๑, ๒, ๓…) and Buddhist Era years (+543),
which are hard to scan on the time scrubber and inconsistent with the UTC+7 timestamp labels
elsewhere in the UI. `'th-TH-u-ca-gregory-nu-latn'` keeps Latin numerals and Gregorian years
while switching month abbreviations to Thai ("พ.ค." instead of "May") — matching modern Thai
apps (LINE, Google Maps in Thai mode).

**Tradeoff accepted:** Buddhist Era years are idiomatic in Thai official contexts. We optimise
for scannability on a data-dense map instead.

### 3. Translation keys returned from lib helpers; `t()` called at render sites only

Several translatable strings live outside JSX in pure helper functions (`frpToIntensity`,
`mapConfidence`, `daynightLabel` in `InfoPanel.tsx`) and in the `AQI_CATEGORIES` data array in
`aqiColors.ts`. Rather than importing `i18next` into lib files or passing `t` as a parameter,
helpers return a translation key (e.g. `{ labelKey: 'fire.intensity.large' }`) and the calling
component translates with `t(labelKey)`.

`AqiCategory` gains a `key: string` field alongside the existing `label` (English fallback).
Render sites use `t(cat.key)`.

**Why:** Lib files stay free of i18next dependency and remain pure functions. Reactivity is
preserved — language changes trigger re-renders at the component level where `useTranslation`
is called. Passing `t` into every helper would couple lib signatures to i18next; calling
`i18next.t()` imperatively in lib files loses automatic re-render on language change.

## Addendum (2026-10-06): changes since this ADR

- **Decision 1 (language store):** `i18next-browser-languagedetector` is no longer used. `i18n.ts` resolves the language itself, in this order: `/th` URL path, `?lang=`, the value stored in `settingsStore`, then `navigator.language`. The Thai site is served at `/th/` (static HTML with its own og tags), and `i18n.ts` redirects when the path and the resolved language disagree. `settingsStore` is now at schema version 3.
- **Decision 2 (date formatting):** superseded. `dateLocale()` now returns `'th-TH-u-nu-latn'` (Thai month names, Latin numerals, and the default Thai calendar, so years are Buddhist Era), and `toDisplayYear()` adds 543 to displayed years (commit 8ec6d1c). The Gregorian `-ca-gregory` variant described above is no longer used.
- **Decision 3 (translation keys from helpers):** unchanged.

## Addendum (2026-10-31): the language preference moves to a cookie, decided on the server

- **Decision 1 (language store): superseded.** A visitor's language preference is a cookie, `lang`
  (`en` or `th`), set only by the language switch. It is no longer in `settingsStore`: version 4
  drops a saved value and does not copy it, because that value mixed explicit choices with mere
  visits to a Thai page. The terms are in `CONTEXT.md`.
- **The browser no longer decides the page language.** `i18n.ts` takes it from the address. Edge
  middleware (`src/middleware.ts`, the rules in `lib/languageRedirect.ts`) handles requests for
  `/`, in this order: a `?lang=` from the language switch (stores the choice and goes to that page,
  keeping the rest of the query), then the cookie, then the browser's top `Accept-Language`
  language. Thai gets a 302 to `/th/`, never cached. A `/th/` address is never redirected, and any
  error serves the page as it is.
- **Why:** the redirect used to run once the map's JavaScript had loaded, so Thai visitors saw the
  English header and sidebar first, and nothing happened if the map failed to load. On the server
  it happens before a page is sent.
- **Landing on a Thai page does not remember Thai.** Only an explicit choice with the language
  switch is a preference. Before, any visit to `/th/` was saved, so a shared Thai link could turn
  someone into a Thai visitor for good, and remembering it on the server would have needed the
  middleware (and a cookie) on every Thai page.
- **Alternatives considered:** keep the redirect in the browser (the English flash and the
  dependence on the map stay); remember on landing; copy the old saved language into the cookie.
- **Costs:** Astro's edge middleware runs for every on-demand page, not only `/` (see ADR 0007).
  Without cookies the browser's language decides.
- Decisions 2 (superseded above) and 3 are unchanged.
