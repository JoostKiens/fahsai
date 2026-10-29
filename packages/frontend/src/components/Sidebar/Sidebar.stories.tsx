import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { useLayerStore } from '@/store/layerStore';
import { Sidebar } from './Sidebar';

// The desktop layer panel (hidden below md). Layer visibility comes from the layer store, which
// the preview resets before every story.
const meta = {
  component: Sidebar,
  // The app lays the sidebar out in a full-height flex row.
  decorators: [
    (Story) => (
      <div className="flex h-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Sidebar>;

export default meta;
type Story = StoryObj<typeof meta>;

// The app's defaults: every layer on except power plants.
export const Default: Story = {};

export const PowerPlantsShown: Story = {
  beforeEach: () => {
    const { layers } = useLayerStore.getState();
    useLayerStore.setState({
      layers: { ...layers, powerPlants: { ...layers.powerPlants, visible: true } },
    });
  },
};

export const Thai: Story = {
  globals: { locale: 'th' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('complementary', { name: 'เลเยอร์แผนที่' })).toBeVisible();
    await expect(canvas.getByRole('switch', { name: 'ไฟ' })).toBeVisible();
  },
};

export const ToggleHidesFires: Story = {
  play: async ({ canvas, userEvent }) => {
    const fires = canvas.getByRole('switch', { name: 'Fires' });
    await userEvent.click(fires);
    await expect(fires).toHaveAttribute('aria-checked', 'false');
    await expect(useLayerStore.getState().layers.fires.visible).toBe(false);
  },
};
