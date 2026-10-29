import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { CountryFlag } from './CountryFlag';

const meta = {
  component: CountryFlag,
  // Every code with a flag file, plus one without (FRA).
  argTypes: {
    iso3: {
      control: 'select',
      options: ['THA', 'MMR', 'LAO', 'KHM', 'MYS', 'VNM', 'CHN', 'IND', 'BGD', 'BTN', 'FRA'],
    },
  },
} satisfies Meta<typeof CountryFlag>;

export default meta;
type Story = StoryObj<typeof meta>;

// Also proves /flags is served: a missing file leaves the image with no natural size.
export const Thailand: Story = {
  args: { iso3: 'THA' },
  play: async ({ canvasElement }) => {
    const flag = canvasElement.querySelector('img');
    await expect(flag).toHaveAttribute('src', '/flags/th.svg');
    await waitFor(() => expect(flag?.naturalWidth).toBeGreaterThan(0));
  },
};

export const Myanmar: Story = { args: { iso3: 'MMR' } };

export const Laos: Story = { args: { iso3: 'LAO' } };

export const Cambodia: Story = { args: { iso3: 'KHM' } };

// Codes are matched case-insensitively.
export const LowercaseCode: Story = { args: { iso3: 'tha' } };

// A country without a flag file renders nothing rather than a broken image.
export const UnknownCode: Story = {
  args: { iso3: 'FRA' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('img')).toBeNull();
  },
};
