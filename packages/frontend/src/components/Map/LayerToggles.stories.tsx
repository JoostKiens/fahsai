import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, waitFor } from 'storybook/test';
import type { Deck, LayersList } from '@deck.gl/core';
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
  const ambient = useLayerStore((s) => s.layers.aqGrid);
  const fires = useLayerStore((s) => s.layers.fires);
  const bitmap = useCamsBitmap(camsPoints);
  // Like MapView: fires don't wait for the CAMS bitmap and take their opacity from the store.
  const firesLayer = useMemo(
    () => fires.visible && createFiresLayer(firesResponse.data, fires.opacity, handleFireClick),
    [fires.visible, fires.opacity],
  );
  const ambientLayers = useMemo(
    () => (ambient.visible && bitmap ? [createLandMaskLayer(), createPM25BitmapLayer(bitmap)] : []),
    [ambient.visible, bitmap],
  );
  // null keeps the harness not-ready until the visible PM2.5 grid has its bitmap.
  const layers = useMemo(
    () =>
      ambient.visible && !bitmap ? null : [...ambientLayers, ...(firesLayer ? [firesLayer] : [])],
    [ambient.visible, bitmap, ambientLayers, firesLayer],
  );
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
    await expect(canvas.getByText('µg/m³')).toBeVisible();
    for (const range of ['0–9', '9–35', '35–55', '55–125', '125–225', '225+']) {
      await expect(canvas.getByText(range)).toBeVisible();
    }

    const deck = await waitForRenderReady(canvasElement);
    await expect(layerIds(deck)).toContain('fire-glow');

    const firesToggle = canvas.getByRole('switch', { name: 'Fires' });
    await expect(firesToggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(firesToggle);
    await expect(firesToggle).toHaveAttribute('aria-checked', 'false');
    await expect(useLayerStore.getState().layers.fires.visible).toBe(false);
    // The ready flag may still be from the previous frame; wait for the layer itself to go.
    await waitFor(() => expect(layerIds(deck)).not.toContain('fire-glow'));
    await waitForRenderReady(canvasElement);
  },
};

// Ids of the layers handed to the Deck (no canvas reads).
function layerIds(deck: Deck): string[] {
  const ids: string[] = [];
  const visit = (list: LayersList) => {
    for (const item of list) {
      if (Array.isArray(item)) visit(item);
      else if (item) ids.push(item.id);
    }
  };
  visit(deck.props.layers);
  return ids;
}
