import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn } from 'storybook/test';
import { Toggle } from './Toggle';

const meta = {
  component: Toggle,
  args: { label: 'Fires', onChange: fn() },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  args: { checked: false },
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', { name: args.label });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    await expect(args.onChange).toHaveBeenCalledOnce();
  },
};

export const On: Story = { args: { checked: true } };

// Proves Tailwind loaded: the checked track is `bg-teal-600`; fails with an unstyled transparent track.
export const CssCheck: Story = {
  args: { checked: true },
  play: async ({ args, canvas }) => {
    const toggle = canvas.getByRole('switch', { name: args.label });
    await expect(getComputedStyle(toggle).backgroundColor).toBe('oklch(0.6 0.118 184.704)');
  },
};
