import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // n8n/: bodies of n8n Code nodes (top-level return, n8n globals), tested separately.
  { ignores: ['dist', 'dev-dist', 'node_modules', 'public', 'n8n'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],
    files: ['**/*.{ts,tsx,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Core must stay framework-free so it can be reused (e.g. in a Capacitor build).
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'zustand', 'dexie'],
              message: 'src/core must stay framework-free.',
            },
            {
              group: ['../features/*', '../store/*', '../db/*', '../ui/*'],
              message: 'src/core must not depend on UI or storage.',
            },
          ],
        },
      ],
    },
  },
);
