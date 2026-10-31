// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { HeaderIsland } from '@/islands/HeaderIsland';
import { ScrubberIsland } from '@/islands/ScrubberIsland';
import { SidebarIsland } from '@/islands/SidebarIsland';
import en from '@/locales/en.json';
import th from '@/locales/th.json';

// The Astro pages render some islands on the server, where there is no window, document or
// navigator. These tests run in a Node environment so a browser-only read at import time or during
// render fails here, not in the Vercel build.
describe('server rendering', () => {
  it('imports the stores without a browser', async () => {
    await expect(import('@/store/uiStore')).resolves.toHaveProperty('useUIStore');
    await expect(import('@/store/timeStore')).resolves.toHaveProperty('useTimeStore');
  });

  it.each([
    ['en', 'Station readings'],
    ['th', 'ค่าวัดจากสถานี'],
  ] as const)('renders the sidebar island in %s', (lang, stationReadings) => {
    const html = renderToString(<SidebarIsland lang={lang} />);

    expect(html).toContain(stationReadings);
  });

  it('renders one switch per layer', () => {
    const html = renderToString(<SidebarIsland lang="en" />);

    expect(html.match(/role="switch"/g)).toHaveLength(5);
  });

  it.each([
    ['en', en],
    ['th', th],
  ] as const)('renders the header island in %s, search input included', (lang, strings) => {
    const html = renderToString(<HeaderIsland lang={lang} />);

    expect(html).toContain('Fahsai');
    expect(html).toContain(strings['header.subtitle']);
    expect(html).toContain(`placeholder="${strings['search.placeholder']}"`);
  });

  describe('scrubber island', () => {
    const DAYS = 120;
    const latestDate = '2026-10-30';
    const timeline = Array.from({ length: DAYS }, (_, i) => ({
      date: new Date(Date.UTC(2026, 9, 30) - (DAYS - 1 - i) * 86_400_000)
        .toISOString()
        .slice(0, 10),
      pm25: 20 + (i % 30),
    }));

    it.each([
      ['en', '30 Oct 2026', '3 Jul'],
      ['th', '30 ต.ค.', '3 ก.ค.'],
    ] as const)('renders the date, the range and the chart in %s', (lang, date, rangeStart) => {
      const html = renderToString(<ScrubberIsland lang={lang} data={{ latestDate, timeline }} />);

      expect(html).toContain(date);
      expect(html).toContain(rangeStart);
      expect(html).toContain('preserveAspectRatio="none"');
    });

    it('renders the placeholders when the server has no data', () => {
      const html = renderToString(<ScrubberIsland lang="en" data={null} />);

      expect(html).not.toContain('30 Oct 2026');
      expect(html).not.toContain('preserveAspectRatio="none"');
      expect(html).toContain('animate-pulse');
    });

    it('renders the date without a chart when only the timeline is missing', () => {
      const html = renderToString(
        <ScrubberIsland lang="en" data={{ latestDate, timeline: null }} />,
      );

      expect(html).toContain('30 Oct 2026');
      expect(html).not.toContain('preserveAspectRatio="none"');
    });
  });

  it('keeps the two languages apart', () => {
    const en = renderToString(<SidebarIsland lang="en" />);
    const th = renderToString(<SidebarIsland lang="th" />);

    expect(en).not.toContain('ค่าวัดจากสถานี');
    expect(th).not.toContain('Station readings');
  });
});
