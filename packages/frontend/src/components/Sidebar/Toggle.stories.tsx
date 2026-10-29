import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { expect, fn } from 'storybook/test';
import { Toggle } from './Toggle';

type ToggleProps = ComponentProps<typeof Toggle>;

// Toggle is controlled; this keeps `checked` in React state so the story stays clickable.
// Storybook's useArgs would also sync the Controls panel, but its re-render clears the
// `onChange` spy's calls in the UI and never happens under the Vitest addon.
function StatefulToggle({ checked: initialChecked, onChange, labelledBy }: ToggleProps) {
  const [checked, setChecked] = useState(initialChecked);
  function handleChange() {
    onChange();
    setChecked(!checked);
  }
  return <Toggle checked={checked} onChange={handleChange} labelledBy={labelledBy} />;
}

// Toggle has no text of its own; like the sidebar rows, the story names it with visible text.
const meta = {
  component: Toggle,
  args: { labelledBy: 'layer-label', onChange: fn() },
  render: (args: ToggleProps) => (
    <div className="flex items-center gap-2">
      <span id="layer-label" className="text-[13px] font-medium">
        Fires
      </span>
      {/* Remount when the `checked` control changes so it resets the state. */}
      <StatefulToggle key={String(args.checked)} {...args} />
    </div>
  ),
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = { args: { checked: false } };

export const On: Story = { args: { checked: true } };

// Starts off and is clicked by its play function, so it ends up on in the Storybook UI.
export const ClickTurnsOn: Story = {
  args: { checked: false },
  play: async ({ args, canvas, userEvent }) => {
    const toggle = canvas.getByRole('switch', { name: 'Fires' });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(toggle);
    await expect(args.onChange).toHaveBeenCalledOnce();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
  },
};

// Proves Tailwind loaded: the checked track is `bg-teal-600`; fails with an unstyled transparent track.
export const CssCheck: Story = {
  args: { checked: true },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('switch', { name: 'Fires' });
    await expect(getComputedStyle(toggle).backgroundColor).toBe('oklch(0.6 0.118 184.704)');
  },
};
