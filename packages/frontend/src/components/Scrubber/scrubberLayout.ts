/**
 * The scrubber bar's background, border and minimum height. The page puts a placeholder with these
 * classes in the HTML before the scrubber island mounts (layouts/AppShell.astro), and the scrubber
 * and its error fallback use them too, so the sidebar and map don't resize when it appears. The
 * minimum height is the scrubber's own height: the stories in Scrubber.stories.tsx fail when they
 * stop matching, at both sides of the md breakpoint.
 */
export const SCRUBBER_BAR_CLS =
  'bg-zinc-900 border-t border-zinc-800 min-h-[59px] md:min-h-[83.5px]';
