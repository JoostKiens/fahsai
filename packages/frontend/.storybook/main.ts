import type { StorybookConfig } from '@storybook/react-vite';
import { msw } from 'msw/vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-vitest',
    '@storybook/addon-docs',
    '@storybook/addon-mcp',
    '@storybook/addon-a11y',
  ],
  framework: '@storybook/react-vite',
  // Exposes documented components to agents via the MCP addon's docs-list / docs-show tools.
  features: { componentsManifest: true },
  core: { disableTelemetry: true },
  // Serves MSW's worker script (/mockServiceWorker.js) from the dev server and emits it in
  // build-storybook output, so nothing is added to public/. Only Storybook's config has the
  // plugin, so the app build never contains it.
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    plugins: [...(viteConfig.plugins ?? []), msw({ mode: 'worker-only' })],
  }),
};

export default config;
