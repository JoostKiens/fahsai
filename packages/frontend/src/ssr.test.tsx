// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { SidebarIsland } from '@/islands/SidebarIsland';

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

  it('keeps the two languages apart', () => {
    const en = renderToString(<SidebarIsland lang="en" />);
    const th = renderToString(<SidebarIsland lang="th" />);

    expect(en).not.toContain('ค่าวัดจากสถานี');
    expect(th).not.toContain('Station readings');
  });
});
