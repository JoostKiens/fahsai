import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { expect, fn } from 'storybook/test';
import { PlayButton } from './PlayButton';

type PlayButtonProps = ComponentProps<typeof PlayButton>;

// PlayButton is controlled; this keeps `playing` in React state so the story stays clickable
// (same approach as the Toggle stories).
function StatefulPlayButton({ playing: initialPlaying, onToggle }: PlayButtonProps) {
  const [playing, setPlaying] = useState(initialPlaying);
  function handleToggle() {
    onToggle();
    setPlaying((current) => !current);
  }
  return <PlayButton playing={playing} onToggle={handleToggle} />;
}

const meta = {
  component: PlayButton,
  args: { onToggle: fn() },
  // Remount when the `playing` control changes so it resets the state.
  render: (args: PlayButtonProps) => <StatefulPlayButton key={String(args.playing)} {...args} />,
} satisfies Meta<typeof PlayButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = { args: { playing: false } };

export const Playing: Story = { args: { playing: true } };

// Starts paused and is clicked by its play function, so it ends up playing in the Storybook UI.
export const ClickStartsPlaying: Story = {
  args: { playing: false },
  play: async ({ args, canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Play' }));
    await expect(args.onToggle).toHaveBeenCalledOnce();
    await expect(canvas.getByRole('button', { name: 'Pause' })).toBeVisible();
  },
};
