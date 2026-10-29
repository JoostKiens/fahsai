import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { ComponentProps } from 'react';
import { expect, fn, waitFor, within } from 'storybook/test';
import { BottomSheet } from './BottomSheet';

type BottomSheetProps = ComponentProps<typeof BottomSheet>;

const DETENTS = { peekHeight: 200, fullHeight: 500 };

// BottomSheet is controlled; this keeps `open` and the detent in React state so closing,
// reopening and dragging work in the story (same approach as the Toggle stories).
function StatefulBottomSheet({
  open: initialOpen,
  activeDetent: initialDetent,
  onClose,
  onDetentChange,
  ...props
}: BottomSheetProps) {
  const [open, setOpen] = useState(initialOpen);
  const [detent, setDetent] = useState(initialDetent);
  function handleClose() {
    onClose();
    setOpen(false);
  }
  function handleDetentChange(next: 'peek' | 'full') {
    onDetentChange?.(next);
    setDetent(next);
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="m-4 rounded border border-zinc-700 px-3 py-1 text-zinc-200"
      >
        Open sheet
      </button>
      <BottomSheet
        {...props}
        open={open}
        activeDetent={detent}
        onClose={handleClose}
        onDetentChange={handleDetentChange}
      />
    </>
  );
}

const meta = {
  component: BottomSheet,
  args: {
    open: true,
    ariaLabel: 'Map layers',
    closeAriaLabel: 'Close',
    onClose: fn(),
    onDetentChange: fn(),
    children: (
      <p className="px-4 pb-4 text-[13px] text-zinc-300">
        Sheet content. On the map this holds the layer menu or the info panel.
      </p>
    ),
  },
  argTypes: { children: { control: false } },
  // The sheet is mobile-only (hidden from the md breakpoint up).
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  // Remount when the `open` or detent controls change so they reset the state.
  render: (args: BottomSheetProps) => (
    <StatefulBottomSheet key={`${args.open}-${args.activeDetent}`} {...args} />
  ),
} satisfies Meta<typeof BottomSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

// The layer menu: one height, backdrop behind it.
export const SingleDetent: Story = {};

// The info panel at its first stop; the map behind stays tappable (no backdrop).
export const Peek: Story = {
  args: { detents: DETENTS, activeDetent: 'peek', showBackdrop: false },
};

export const Full: Story = {
  args: { detents: DETENTS, activeDetent: 'full', showBackdrop: false },
};

// The sheet is portalled to <body>, outside the story's canvas.
export const CloseButtonCloses: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(page.getByRole('button', { name: 'Close' }));
    await expect(args.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole('button', { name: 'Close' })).toBeNull());
  },
};

export const EscapeCloses: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.keyboard('{Escape}');
    await expect(args.onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(page.queryByRole('button', { name: 'Close' })).toBeNull());
  },
};

// The layer menu is modal: opening it moves focus into the sheet, the page behind can't take
// focus, and closing returns focus to whatever opened it.
export const ModalFocus: Story = {
  args: { open: false },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const opener = page.getByRole('button', { name: 'Open sheet' });
    await userEvent.click(opener);
    const sheet = await page.findByRole('dialog', { name: 'Map layers' });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet).toHaveFocus();

    // Inert content can't take focus by Tab, click or script.
    opener.focus();
    await expect(opener).not.toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

// The info panel sheet is non-modal: focus moves in, but the map behind stays usable.
export const NonModalFocus: Story = {
  args: { open: false, detents: DETENTS, activeDetent: 'peek', showBackdrop: false },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const opener = page.getByRole('button', { name: 'Open sheet' });
    await userEvent.click(opener);
    const sheet = await page.findByRole('dialog', { name: 'Map layers' });
    await expect(sheet).not.toHaveAttribute('aria-modal');
    await expect(sheet).toHaveFocus();

    opener.focus();
    await expect(opener).toHaveFocus();
  },
};

// From the md breakpoint up the sheet is hidden (desktop has its own panels), so an open modal
// sheet must not make the page inert: nothing visible could close it.
export const HiddenOnDesktop: Story = {
  globals: { viewport: { value: 'tablet', isRotated: false } },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const opener = page.getByRole('button', { name: 'Open sheet' });
    await expect(page.getByRole('dialog', { hidden: true })).not.toBeVisible();
    opener.focus();
    await expect(opener).toHaveFocus();
  },
};
