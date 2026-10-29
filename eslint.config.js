// @ts-check
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import storybook from 'eslint-plugin-storybook';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.vite/**',
      '**/coverage/**',
      '**/storybook-static/**',
    ],
  },

  // TypeScript with type-checking for all packages
  {
    files: ['packages/*/src/**/*.{ts,tsx}'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          './packages/types/tsconfig.json',
          './packages/backend/tsconfig.json',
          './packages/frontend/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
    },
  },

  // React hooks rules — frontend only
  {
    files: ['packages/frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Storybook rules — *.stories.* files only
  ...storybook.configs['flat/recommended'],
  // The Storybook preset switches rules-of-hooks off for stories; story render functions and
  // components still have to follow it.
  {
    files: ['packages/frontend/src/**/*.stories.tsx'],
    rules: { 'react-hooks/rules-of-hooks': 'error' },
  },

  // Prettier last — disables all formatting rules that conflict with Prettier
  prettier,
];
