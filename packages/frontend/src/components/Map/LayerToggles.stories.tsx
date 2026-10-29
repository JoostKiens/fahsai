import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { LayerGroups } from '@/components/Sidebar';
import { useLayerStore } from '@/store/layerStore';
import { parseCamsGridResponse } from '@/utils/camsColumns';
import camsResponse from './story-harness/fixtures/2026-10-24/cams.json';
import firesResponse from './story-harness/fixtures/2026-10-24/fires.json';
import { DeckHarness, waitForRenderReady } from './story-harness/DeckHarness';
import { createFiresLayer } from './FiresLayer';
import { createLandMaskLayer, createPM25BitmapLayer } from './PM25Layer';
import { useCamsBitmap } from './useCamsBitmap';

const camsPoints = parseCamsGridResponse(camsResponse.data);
const handleFireClick = () => {};

/** The sidebar's layer toggles driving the PM2.5 grid and fire layers, as MapView wires them. */
function LayerToggles() {
  const isAmbientVisible = useLayerStore((s) => s.layers.aqGrid.visible);
  const areFiresVisible = useLayerStore((s) => s.layers.fires.visible);
  const bitmap = useCamsBitmap(camsPoints);
  const layers = bitmap && [
    ...(isAmbientVisible ? [createLandMaskLayer(), createPM25BitmapLayer(bitmap)] : []),
    ...(areFiresVisible ? [createFiresLayer(firesResponse.data, 1, handleFireClick)] : []),
  ];
  return (
    <div className="flex gap-4">
      <div className="w-72 shrink-0 bg-zinc-900">
        <LayerGroups />
      </div>
      <DeckHarness layers={layers} />
    </div>
  );
}

const meta = {
  title: 'Map/Layer toggles',
  component: LayerToggles,
  beforeEach: () => {
    useLayerStore.setState(useLayerStore.getInitialState());
  },
} satisfies Meta<typeof LayerToggles>;

export default meta;
type Story = StoryObj<typeof meta>;

// The kind of check an agent typically writes: DOM, store and readiness only, nothing that
// looks at the canvas. Phase 4 of docs/experiments/storybook-canvas.md plants rendering bugs
// that this still passes.
export const LegendAndFireToggle: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await waitForRenderReady(canvasElement);

    await expect(canvas.getByText('µg/m³')).toBeVisible();
    for (const range of ['0–9', '9–35', '35–55', '55–125', '125–225', '225+']) {
      await expect(canvas.getByText(range)).toBeVisible();
    }

    const firesToggle = canvas.getByRole('switch', { name: 'Fires' });
    await expect(firesToggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(firesToggle);
    await expect(firesToggle).toHaveAttribute('aria-checked', 'false');
    await expect(useLayerStore.getState().layers.fires.visible).toBe(false);
    await waitForRenderReady(canvasElement);
  },
};
