import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-vitest', '@storybook/addon-docs', '@storybook/addon-mcp'],
  framework: '@storybook/react-vite',
  // Exposes documented components to agents via the MCP addon's docs-list / docs-show tools.
  features: { componentsManifest: true },
  core: { disableTelemetry: true },
};

export default config;
