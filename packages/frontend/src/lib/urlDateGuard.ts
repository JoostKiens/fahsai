// Plain JavaScript for <head> (Base.astro), run before the first paint: when the link asks for a
// date, it flags <html> and the scrubber shows placeholders instead of the latest day, which is what
// the server rendered. The page is cached for every link, so only the browser can tell. Scrubber.tsx
// removes the flag once the latest date is known and the scrubber is on the link's day.
// Imported by astro.config.mjs too, to put this script's hash in the CSP.
export const urlDateGuardScript = `(function () {
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(new URLSearchParams(location.search).get('date') || '')) {
    document.documentElement.setAttribute('data-url-date', '');
  }
})();`;
