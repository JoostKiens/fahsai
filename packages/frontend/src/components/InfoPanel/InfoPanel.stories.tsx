import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw/http';
import { expect, waitFor, within } from 'storybook/test';
import { useSettingsStore } from '@/store/settingsStore';
import { useTimeStore } from '@/store/timeStore';
import { useUIStore, type SelectedPoint } from '@/store/uiStore';
import stationReadings from '../Map/story-harness/fixtures/2026-10-24/station-readings.json';
import windResponse from '../Map/story-harness/fixtures/2026-10-24/wind.json';
import baselineSaraphi from './fixtures/2026-10-24/baseline-saraphi.json';
import historySaraphi from './fixtures/2026-10-24/history-saraphi-panel.json';
import { InfoPanel } from './InfoPanel';

// Production API responses for 2026-10-24 (the panel asks for 6 history days ending the day
// after the selected one). Mapbox reverse geocoding is written by hand: recording it needs the
// Mapbox token, which stays out of reach of these stories.
const DATE = '2026-10-24';
const SCRUBBER_DAYS = 30;

const SARAPHI: SelectedPoint = {
  lngLat: [99.0471604318204, 18.6909257690374],
  station: {
    stationId: '2827389',
    stationName: 'Saraphi, Chiang Mai',
    country: 'TH',
    provider: 'AirGradient',
    pm25: 22.1,
    measuredAt: '2026-10-24T00:00:00+00:00',
  },
};

// A VIIRS detection near Chom Thong from the 2026-10-24 fires fixture.
const FIRE: SelectedPoint = {
  lngLat: [98.6162, 18.03115],
  fire: { id: 2063404, frp: 3.46, confidence: 'n', detectedAt: '2026-10-24T07:22:00+00:00' },
};

// From /api/v1/power-plants (WRI Global Power Plant Database).
const MAE_MAH: SelectedPoint = {
  lngLat: [99.7499, 18.2963],
  powerPlant: {
    id: 43,
    name: 'Mae Mah',
    fuelType: 'Coal',
    capacityMw: 2400,
    owner: 'Electric Generating Authority of Thailand',
    commissionedYear: 1995,
    country: 'THA',
  },
};

// Just the fields reverseGeocode reads: the feature's context, most specific first.
function geocodeResponse(context: { id: string; text: string }[]) {
  return {
    features: [{ context: [...context, { id: 'country.1', text: 'Thailand', short_code: 'th' }] }],
  };
}

// Answers by longitude, which tells the three selections apart.
function geocodeFor(lng: number) {
  if (lng > 99.5) return geocodeResponse([{ id: 'place.1', text: 'Mae Mo' }]);
  if (lng < 98.8) return geocodeResponse([{ id: 'place.1', text: 'Chom Thong' }]);
  return geocodeResponse([
    { id: 'locality.1', text: 'Nong Phueng' },
    { id: 'place.1', text: 'Saraphi' },
  ]);
}

const handlers = [
  http.get('*/api/v1/station-readings/latest', () => HttpResponse.json(stationReadings)),
  http.get('*/api/v1/weather/wind', () => HttpResponse.json(windResponse)),
  http.get('*/api/v1/stations/:id/history', () => HttpResponse.json(historySaraphi)),
  http.get('*/api/v1/stations/:id/baseline', () => HttpResponse.json(baselineSaraphi)),
  http.get('*/api/v1/cams/nearest', ({ request }) => {
    const lng = Number(new URL(request.url).searchParams.get('lng'));
    // The nearest CAMS cells to the fire and to Mae Mah.
    const point =
      lng < 99.2 ? { lat: 18.2, lng: 98.6, pm25: 8 } : { lat: 18.2, lng: 99.8, pm25: 11.9 };
    return HttpResponse.json({ data: point });
  }),
  // …/mapbox.places/{lng},{lat}.json
  http.get('https://api.mapbox.com/geocoding/v5/mapbox.places/:coordinates', ({ params }) =>
    HttpResponse.json(geocodeFor(Number(String(params.coordinates).split(',')[0]))),
  ),
];

function selecting(point: SelectedPoint) {
  return () => {
    useUIStore.setState({ selectedPoint: point });
  };
}

const meta = {
  component: InfoPanel,
  parameters: { msw: { handlers } },
  beforeEach: () => {
    useSettingsStore.setState({ scrubberDays: SCRUBBER_DAYS });
    useUIStore.setState({ scrubberDay: SCRUBBER_DAYS - 1 });
    useTimeStore.setState({ latestDate: DATE, latestDateResolved: true, selectedDate: DATE });
  },
  // The desktop card is absolutely positioned over the map.
  decorators: [
    (Story) => (
      <div className="relative h-[760px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof InfoPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// A station: live reading, place name, the week's history, and the typical year. First, so the
// Docs page shows a selected point.
export const Station: Story = {
  beforeEach: selecting(SARAPHI),
  play: async ({ canvas }) => {
    const panel = within(canvas.getByRole('region', { name: 'Point details' }));
    // The content fades in from opacity 0, which toBeVisible treats as hidden.
    await waitFor(() => expect(panel.getByText('Saraphi, Chiang Mai')).toBeVisible());
    await expect(await panel.findByText('Nong Phueng · Saraphi')).toBeVisible();
    await expect(panel.getByLabelText('PM2.5 22, Moderate')).toBeVisible();
    await expect(await panel.findByText('Weather')).toBeVisible();
  },
};

// Nothing selected: a prompt to click the map.
export const NothingSelected: Story = {};

// Selected after mount: the panel clears a fire selection whenever the date changes, and that
// effect also runs on mount. In the app the panel mounts before anything is clicked.
export const Fire: Story = {
  play: async ({ canvas }) => {
    useUIStore.setState({ selectedPoint: FIRE });
    const panel = within(canvas.getByRole('region', { name: 'Point details' }));
    await waitFor(() => expect(panel.getByText('Fire Detection')).toBeVisible());
    await expect(await panel.findByText('Chom Thong')).toBeVisible();
  },
};

export const PowerPlant: Story = {
  beforeEach: selecting(MAE_MAH),
  play: async ({ canvas }) => {
    const panel = within(canvas.getByRole('region', { name: 'Point details' }));
    await waitFor(() => expect(panel.getByText('Mae Mah')).toBeVisible());
    await expect(await panel.findByText('Mae Mo')).toBeVisible();
    await expect(panel.getByText('Coal')).toBeVisible();
  },
};

// Opened from a shared link: the selection is known but not yet resolved to a point.
export const Resolving: Story = {
  beforeEach: () => {
    useUIStore.setState({ pendingSelection: { kind: 'station', id: '2827389' } });
  },
};

// A station that didn't report on the selected date is deselected.
export const StationNotReporting: Story = {
  beforeEach: selecting({
    ...SARAPHI,
    station: { ...SARAPHI.station!, stationId: 'not-in-latest-readings' },
  }),
  play: async ({ canvas }) => {
    await waitFor(() => expect(canvas.getByText(/Click a point/)).toBeVisible());
    await expect(useUIStore.getState().selectedPoint).toBeNull();
  },
};

// Mobile: the same panel in a bottom sheet, with previous/next day buttons.
export const StationOnMobile: Story = {
  globals: { viewport: { value: 'mobile2', isRotated: false } },
  beforeEach: selecting(SARAPHI),
  play: async ({ canvasElement, userEvent }) => {
    const sheet = within(
      await within(canvasElement.ownerDocument.body).findByRole('dialog', {
        name: 'Point details',
      }),
    );
    await expect(sheet.getByRole('button', { name: 'Next day' })).toBeDisabled();
    await userEvent.click(await sheet.findByRole('button', { name: 'Previous day, 23 Oct' }));
    await expect(useUIStore.getState().scrubberDay).toBe(SCRUBBER_DAYS - 2);
  },
};

export const Thai: Story = { globals: { locale: 'th' }, beforeEach: selecting(SARAPHI) };
