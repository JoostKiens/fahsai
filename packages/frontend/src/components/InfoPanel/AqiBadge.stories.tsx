import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { AqiBadge } from './AqiBadge';

// One story per US EPA category. `category` is the translated label the info panel passes in.
const meta = {
  component: AqiBadge,
  args: { source: 'measured' },
} satisfies Meta<typeof AqiBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Good: Story = { args: { value: 5, category: 'Good' } };

export const Moderate: Story = { args: { value: 22, category: 'Moderate' } };

export const UnhealthyForSensitiveGroups: Story = {
  args: { value: 45, category: 'Unhealthy for sensitive groups' },
};

// Colour as a literal, not from aqiColors, so a broken scale can't change both sides.
export const Unhealthy: Story = {
  args: { value: 90, category: 'Unhealthy' },
  play: async ({ canvas }) => {
    const badge = canvas.getByLabelText('PM2.5 90, Unhealthy');
    await expect(getComputedStyle(badge).backgroundColor).toBe('rgb(255, 0, 0)');
  },
};

export const VeryUnhealthy: Story = { args: { value: 180, category: 'Very unhealthy' } };

export const Hazardous: Story = { args: { value: 300, category: 'Hazardous' } };

// 35.4 is the top of Moderate: it shows as 35 and stays yellow; 35.5 would turn orange.
export const ModerateUpperBreakpoint: Story = {
  args: { value: 35.4, category: 'Moderate' },
  play: async ({ canvas }) => {
    const badge = canvas.getByLabelText('PM2.5 35, Moderate');
    await expect(getComputedStyle(badge).backgroundColor).toBe('rgb(240, 210, 50)');
  },
};

// Model estimate (CAMS) rather than a station reading: hatched, and the label says so.
export const Modelled: Story = {
  args: { value: 45, category: 'Unhealthy for sensitive groups', source: 'modelled' },
};
