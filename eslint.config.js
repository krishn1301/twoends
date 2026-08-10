import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Deliberately not type-aware. `tsc --build` already typechecks every project in
 * `pnpm check`, so turning on the type-aware rule set would run the compiler
 * twice for a small marginal gain and make `pnpm check` slow enough to skip.
 * A check nobody waits for is a check nobody runs.
 */
export default tseslint.config(
  { ignores: ['**/dist/', '**/dist-*/', '**/node_modules/', 'Inspiration/'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // Build and test tooling: plain Node, no browser.
    files: ['scripts/**/*.mjs', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  /*
   * The architectural rule, enforced by the linter as well as by
   * packages/core/test/no-platform-imports.test.ts. The test gives a better
   * error message; this gives it to you in the editor, before you save.
   */
  {
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['react', 'react-dom', 'dexie'],
          patterns: ['@capacitor/*', '@supabase/*', 'node:*'],
        },
      ],
    },
  },
);
