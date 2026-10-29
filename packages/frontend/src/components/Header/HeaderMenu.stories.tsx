import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { useUIStore } from '@/store/uiStore';
import { HeaderMenu } from './HeaderMenu';

// The header's "more" menu. Settings and About only set a flag in the UI store; the dialogs
// themselves live in Header.
const meta = {
  component: HeaderMenu,
  // The menu sits at the right end of the header bar.
  decorators: [
    (Story) => (
      <div className="flex h-12 items-center justify-end bg-zinc-900 px-3">
        <Story />
      </div>
    ),
  ],
  // axe can run while the closing menu is still mounted. Its popup has Base UI's focus guards:
  // aria-hidden spans with tabIndex 0 that keep focus inside. They're meant to be focusable, so
  // this rule misfires.
  parameters: {
    a11y: { config: { rules: [{ id: 'aria-hidden-focus', enabled: false }] } },
  },
} satisfies Meta<typeof HeaderMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

// Opened from the keyboard: Base UI tells a click that opens from one that closes partly by
// pointer-event timing, which made pointer clicks flaky when the whole suite runs in parallel.
async function openFromKeyboard(
  trigger: HTMLElement,
  user: { keyboard: (text: string) => Promise<void> },
) {
  trigger.focus();
  await user.keyboard('{Enter}');
}

// The menu is portalled to <body>, outside the story's canvas. Closing is checked on the trigger:
// Base UI unmounts the closed menu on a later animation frame, and under a full parallel run those
// frames can take over a second each, so waiting for the menu to leave the DOM was flaky.
export const ChoosingSettingsOpensSettings: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('button', { name: 'More options' });
    await openFromKeyboard(trigger, userEvent);
    await userEvent.click(await page.findByRole('menuitem', { name: 'Settings' }));
    await expect(useUIStore.getState().settingsOpen).toBe(true);
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'false'));
  },
};

export const ChoosingAboutOpensAbout: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openFromKeyboard(canvas.getByRole('button', { name: 'More options' }), userEvent);
    await userEvent.click(await page.findByRole('menuitem', { name: 'About' }));
    await expect(useUIStore.getState().aboutOpen).toBe(true);
  },
};
