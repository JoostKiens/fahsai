import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ComponentProps } from 'react';
import { useArgs } from 'storybook/preview-api';
import { expect, fn } from 'storybook/test';
import { Toggle } from './Toggle';

// Toggle has no text of its own; like the sidebar rows, the story names it with visible text.
// It is controlled, so the story flips its own `checked` arg on change to stay clickable.
const meta = {
  component: Toggle,
  args: { labelledBy: 'layer-label', onChange: fn() },
  render: function Render(args: ComponentProps<typeof Toggle>) {
    const [{ checked }, updateArgs] = useArgs<ComponentProps<typeof Toggle>>();
    function handleChange() {
      args.onChange();
      updateArgs({ checked: !checked });
    }
    return (
      <div className="flex items-center gap-2">
        <span id="layer-label" className="text-[13px] font-medium">
          Fires
        </span>
        <Toggle {...args} checked={checked} onChange={handleChange} />
      </div>
    );
  },
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {
  args: { checked: false },
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', { name: 'Fires' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    // Only the callback is asserted: under the Vitest addon updateArgs does not re-render the
    // story (verified in Storybook 10.6.5), though the switch does flip in the Storybook UI.
    await expect(args.onChange).toHaveBeenCalledOnce();
  },
};

export const On: Story = { args: { checked: true } };

// Proves Tailwind loaded: the checked track is `bg-teal-600`; fails with an unstyled transparent track.
export const CssCheck: Story = {
  args: { checked: true },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('switch', { name: 'Fires' });
    await expect(getComputedStyle(toggle).backgroundColor).toBe('oklch(0.6 0.118 184.704)');
  },
};
