/**
 * The scrubber's height: 59px below the md breakpoint (768px), 83.5px from md up. The page reserves
 * this much space before the scrubber island mounts (layouts/AppShell.astro) and the scrubber keeps
 * it as a minimum, so the sidebar and map don't resize when the scrubber appears. The stories in
 * Scrubber.stories.tsx fail if its real height stops matching.
 */
export const SCRUBBER_MIN_HEIGHT_CLS = 'min-h-[59px] md:min-h-[83.5px]';
