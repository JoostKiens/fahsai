import type { StorybookConfig } from '@storybook/react-vite';
import { msw } from 'msw/vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-vitest', '@storybook/addon-docs', '@storybook/addon-mcp'],
  framework: '@storybook/react-vite',
  // Exposes documented components to agents via the MCP addon's docs-list / docs-show tools.
  features: { componentsManifest: true },
  core: { disableTelemetry: true },
  // Serves MSW's worker script (/mockServiceWorker.js) from the dev server, so nothing is added to
  // public/ and the app build never sees it. shortcut: build-storybook output has no worker, so
  // mocked stories only work in dev; emit it here if Storybook is ever published.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), msw({ mode: 'worker-only' })],
  }),
};

export default config;
