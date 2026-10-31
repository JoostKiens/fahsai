# Fahsai

A free, non-commercial map of the causes of seasonal air pollution in Thailand and its neighbours, in English and Thai.

## Language

**Page language**:
The language a page is served in, fixed by the page's address: English pages have no prefix, Thai pages sit under `/th/`.
_Avoid_: locale, current language

**Language switch**:
The header control a visitor uses to change the **Page language**; it is the only thing that records a **Language preference**.
_Avoid_: language picker, language toggle

**Language preference**:
The language a visitor explicitly chose with the **Language switch**, remembered for later visits.
_Avoid_: saved language, language setting, default language

**Language redirect**:
Sending a visitor who opens the English entry page to the Thai page when their **Language preference** (or, without one, their browser's language) is Thai.
_Avoid_: auto-detect, geo redirect

## Relationships

- A page has exactly one **Page language**, and landing on it never changes the **Language preference**.
- The **Language switch** sets the **Language preference** and takes the visitor to the page in that language.
- The **Language redirect** only applies to the English entry page, never to a Thai page: the address a visitor asked for always wins over their preference.

## Example dialogue

> **Dev:** "A Thai visitor lands on a `/th/` page from Google. Do we remember Thai for next time?"
> **Domain expert:** "No. Landing is not a choice. Only the **Language switch** records a **Language preference**."
> **Dev:** "And if they later open the bare English address?"
> **Domain expert:** "Then the **Language redirect** looks at their preference, or their browser's language if they have none, and sends Thai speakers to the Thai page."

## Flagged ambiguities

- "saved language" was used both for what a visitor chose and for whatever page they last landed on — resolved: only an explicit choice with the **Language switch** is a **Language preference**; landing on a page is not.
