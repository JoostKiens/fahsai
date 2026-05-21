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
