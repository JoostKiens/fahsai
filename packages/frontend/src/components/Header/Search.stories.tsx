import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw/http';
import { expect, waitFor, within } from 'storybook/test';
import { useTimeStore } from '@/store/timeStore';
import { useUIStore } from '@/store/uiStore';
import stationReadings from '../Map/story-harness/fixtures/2026-10-24/station-readings.json';
import { Search } from './Search';

// Stations come from the production readings for 2026-10-24 and are searched in the browser.
// Places come from Mapbox forward geocoding, written by hand here (recording it needs the Mapbox
// token): the few fields Search reads, filtered by the query.
const DATE = '2026-10-24';
const PLACES = [
  { place_name: 'Chiang Mai, Thailand', center: [98.9853, 18.7883] },
  { place_name: 'Chiang Rai, Thailand', center: [99.8325, 19.9105] },
  { place_name: 'Chiang Saen, Chiang Rai, Thailand', center: [100.0839, 20.2747] },
  { place_name: 'Bangkok, Thailand', center: [100.5018, 13.7563] },
];

const handlers = [
  http.get('*/api/v1/station-readings/latest', () => HttpResponse.json(stationReadings)),
  // …/mapbox.places/{query}.json
  http.get('https://api.mapbox.com/geocoding/v5/mapbox.places/:query', ({ params }) => {
    const query = decodeURIComponent(String(params.query))
      .replace(/\.json$/, '')
      .toLowerCase();
    return HttpResponse.json({
      features: PLACES.filter((p) => p.place_name.toLowerCase().includes(query)),
    });
  }),
];

const meta = {
  component: Search,
  parameters: { msw: { handlers } },
  beforeEach: () => {
    useTimeStore.setState({ latestDate: DATE, latestDateResolved: true, selectedDate: DATE });
  },
  // Sits in the header bar. The outer height leaves room for the results dropdown: the preview
  // body scrolls (preview.css), so an absolutely positioned dropdown is clipped at its height.
  decorators: [
    (Story) => (
      <div className="min-h-[400px]">
        <div className="relative flex h-12 items-center bg-zinc-900 px-3">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof Search>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

// Stations match as you type; places follow once the geocoding debounce (300 ms) has passed.
export const StationsAndPlaces: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole('combobox', { name: 'Search' }), 'chiang');
    const listbox = within(canvas.getByRole('listbox'));
    await expect(listbox.getByText('Stations')).toBeVisible();
    await expect(await listbox.findByText('Chiang Rai, Thailand')).toBeVisible();
    await expect(listbox.queryByText('Bangkok, Thailand')).toBeNull();
  },
};

// Arrow Down highlights the first result and Enter selects it, then the search closes.
export const KeyboardSelectsAStation: Story = {
  play: async ({ canvas, userEvent }) => {
    const input = canvas.getByRole('combobox', { name: 'Search' });
    await userEvent.type(input, 'saraphi');
    await expect(within(canvas.getByRole('listbox')).getAllByRole('option')[0]).toHaveTextContent(
      /Saraphi/,
    );
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(useUIStore.getState().selectedPoint?.station?.stationName).toMatch(/Saraphi/);
    await expect(input).toHaveValue('');
  },
};

export const NoResults: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByRole('combobox', { name: 'Search' }), 'zzqx');
    await waitFor(() => expect(canvas.getByText('No results')).toBeVisible());
  },
};

// Mobile: an icon button opens a full-width search field, focused.
export const Mobile: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Search' }));
    await expect(canvas.getByRole('combobox', { name: 'Search' })).toHaveFocus();
  },
};

export const Thai: Story = { globals: { locale: 'th' } };
