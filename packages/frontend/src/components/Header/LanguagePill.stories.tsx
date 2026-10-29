import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LanguagePill } from './LanguagePill';

// Shows the current i18next language, set here by the toolbar's Language switch. Choosing the
// other language reloads the page at / or /th/, so no story selects it: that would navigate
// Storybook's iframe away.
const meta = {
  component: LanguagePill,
  decorators: [
    (Story) => (
      <div className="flex h-12 items-center justify-end bg-zinc-900 px-3">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LanguagePill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = {};

export const Thai: Story = {
  globals: { locale: 'th' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('combobox', { name: 'เลือกภาษา' })).toHaveTextContent('TH');
  },
};

// The list is portalled to <body>, outside the story's canvas.
export const ListMarksCurrentLanguage: Story = {
  play: async ({ canvas, canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole('combobox', { name: 'Select language' }));
    await expect(await page.findByRole('option', { name: 'English' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('option', { name: 'ภาษาไทย' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  },
};
