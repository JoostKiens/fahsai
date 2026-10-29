import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { WebMercatorViewport } from '@deck.gl/core';
import type { Layer } from '@deck.gl/core';
import { parseCamsGridResponse } from '@/utils/camsColumns';
import camsResponse from './story-harness/fixtures/2026-10-24/cams.json';
import windResponse from './story-harness/fixtures/2026-10-24/wind.json';
import {
  DeckHarness,
  HARNESS_HEIGHT_PX,
  HARNESS_WIDTH_PX,
  STORY_VIEW_STATE,
  waitForRenderReady,
} from './story-harness/DeckHarness';
import { seededRandom } from './story-harness/seeded-random';
import { useWindParticles } from './useWindParticles';

const camsPoints = parseCamsGridResponse(camsResponse.data);

// Stand-in for the Mapbox map: reports the harness's fixed view, never moves.
const [west, south, east, north] = new WebMercatorViewport({
  ...STORY_VIEW_STATE,
  width: HARNESS_WIDTH_PX,
  height: HARNESS_HEIGHT_PX,
}).getBounds();
const storyMap = {
  getBounds: () => ({
    getWest: () => west,
    getSouth: () => south,
    getEast: () => east,
    getNorth: () => north,
  }),
  getContainer: () => ({ clientWidth: HARNESS_WIDTH_PX }),
  on: () => undefined,
  off: () => undefined,
};

type Props = {
  /** Seed for particle spawning; same seed and frame give the same picture. */
  seed: number;
  /** Number of fixed 60 Hz steps simulated before the animation is frozen. */
  frame: number;
};

/** Wind particles for 2026-10-24, coloured by the CAMS PM2.5 they spawn in, frozen at one frame. */
function WindParticles({ seed, frame }: Props) {
  const [layers, setLayers] = useState<Layer[] | null>(null);
  const [overlay] = useState(() => ({
    setProps: (props: { layers: Layer[] }) => setLayers(props.layers),
  }));
  const [random] = useState(() => seededRandom(seed));
  useWindParticles(
    overlay,
    storyMap,
    windResponse.data,
    { visible: true, opacity: 1 },
    camsPoints,
    {
      random,
      freezeAtFrame: frame,
    },
  );
  return <DeckHarness layers={layers} />;
}

const meta = {
  title: 'Map/Wind particles',
  component: WindParticles,
  args: { seed: 1, frame: 120 },
  // Bounded: each frame is simulated synchronously before the first paint.
  argTypes: { frame: { control: { type: 'range', min: 0, max: 600, step: 10 } } },
  // Remount on control changes: the seed and frame are only read when the particles start.
  render: (args) => <WindParticles key={`${args.seed}-${args.frame}`} {...args} />,
} satisfies Meta<typeof WindParticles>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await waitForRenderReady(canvasElement);
  },
};
