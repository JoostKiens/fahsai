import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import type { Deck, LayersList } from '@deck.gl/core';
import { useLayerStore } from '@/store/layerStore';
import { waitForRenderReady } from './story-harness/DeckHarness';
import { LayerToggles } from './story-harness/LayerToggles';

const meta = {
  title: 'Map/Layer toggles',
  component: LayerToggles,
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
