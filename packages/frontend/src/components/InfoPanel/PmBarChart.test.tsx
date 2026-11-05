// @vitest-environment node
// A node environment has no `document`, like Astro's server render.
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '@/i18n-instance';
import { PmBarChart } from './PmBarChart';

const DAYS = [
  { date: '2026-11-01', pm25: 26, readingCount: 3 },
  { date: '2026-11-02', pm25: 0, readingCount: 0 },
  { date: '2026-11-03', pm25: 11, readingCount: 2 },
];

function render(barHeight?: number): string {
  return renderToString(
    <I18nextProvider i18n={createI18n('en')}>
      <PmBarChart days={DAYS} barHeight={barHeight} />
    </I18nextProvider>,
  );
}

describe('PmBarChart on the server', () => {
  it('renders the day labels and the y-axis in the HTML', () => {
    const html = render();

    expect(html).toContain('1 Nov');
    expect(html).toContain('3 Nov');
    expect(html).toContain('>30<'); // niceMax of 26
    expect(html).not.toContain('µg/m³'); // the tooltip only exists after a pointer touches a bar
  });

  it('draws a bar only for a day with readings', () => {
    expect(render().match(/border-radius:5px 5px 0 0/g)).toHaveLength(2);
  });

  it('is 72 px tall by default and takes its height from barHeight', () => {
    expect(render()).toContain('height:92px'); // 72 + the day labels
    expect(render(140)).toContain('height:160px');
  });
});
