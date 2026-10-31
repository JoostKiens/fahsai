/**
 * The scrubber bar's background, border and minimum height, shared by the scrubber and its error
 * fallback so the sidebar and map keep their size whatever state the bar is in (placeholders,
 * loaded, or failed). The minimum height is the scrubber's own height: the stories in
 * Scrubber.stories.tsx fail when they stop matching, at both sides of the md breakpoint.
 */
export const SCRUBBER_BAR_CLS =
  'bg-zinc-900 border-t border-zinc-800 min-h-[59px] md:min-h-[83.5px]';
