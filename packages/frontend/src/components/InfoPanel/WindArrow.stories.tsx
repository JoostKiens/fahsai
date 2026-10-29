import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { WindArrow } from './WindArrow';

// `dirDeg` is where the wind comes FROM; the arrow points where it goes.
const meta = {
  component: WindArrow,
  args: { size: 32, color: '#a1a1aa' },
  argTypes: { dirDeg: { control: { type: 'range', min: 0, max: 359, step: 1 } } },
} satisfies Meta<typeof WindArrow>;

export default meta;
type Story = StoryObj<typeof meta>;

// A northerly wind blows south, so the up-pointing arrow is turned 180°.
export const FromNorth: Story = {
  args: { dirDeg: 0 },
  play: async ({ canvasElement }) => {
    const arrow = canvasElement.querySelector('svg');
    await expect(arrow?.style.transform).toBe('rotate(180deg)');
  },
};

export const FromEast: Story = { args: { dirDeg: 90 } };

// The dry-season north-east monsoon.
export const FromNorthEast: Story = { args: { dirDeg: 45 } };

// The wet-season south-west monsoon.
export const FromSouthWest: Story = { args: { dirDeg: 225 } };

// The size used in the info panel's weather table.
export const TableSize: Story = { args: { dirDeg: 45, size: 10 } };
