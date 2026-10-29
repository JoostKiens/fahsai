import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { useLayerStore } from '@/store/layerStore';
import { SidebarToggleFAB } from './SidebarToggleFAB';

// The mobile layer menu: a floating button that opens the layer toggles in a modal bottom sheet.
// Both are portalled to <body> and hidden from md up.
const meta = {
  component: SidebarToggleFAB,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
  // On the Docs page, a phone-width iframe, so md:hidden doesn't hide it.
  parameters: { docs: { story: { inline: false, iframeHeight: 160 } } },
} satisfies Meta<typeof SidebarToggleFAB>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Thai: Story = { globals: { locale: 'th' } };

// Open, hide fires, close: the store keeps the change and focus returns to the button.
export const ToggleALayerFromTheSheet: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement.ownerDocument.body);
    const openButton = page.getByRole('button', { name: 'Open layer controls' });
    await userEvent.click(openButton);

    const sheet = await page.findByRole('dialog', { name: 'Map layers' });
    await expect(sheet).toHaveFocus();
    await userEvent.click(within(sheet).getByRole('switch', { name: 'Fires' }));
    await expect(useLayerStore.getState().layers.fires.visible).toBe(false);

    await userEvent.click(within(sheet).getByRole('button', { name: 'Close layer controls' }));
    await waitFor(() => expect(openButton).toHaveFocus());
  },
};
