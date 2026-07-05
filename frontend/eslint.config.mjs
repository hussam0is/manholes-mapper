import js from '@eslint/js';
import pluginImport from 'eslint-plugin-import';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.ts'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
    },
    plugins: { import: pluginImport },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'import/order': [
        'warn',
        {
          'newlines-between': 'always',
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
        },
      ],
    },
  },
  {
    // *.d.ts are TypeScript declaration files — the default espree parser
    // can't parse `interface`/`declare`, so lint always exited 1 on them.
    ignores: ['dist/**', 'node_modules/**', 'src/legacy/main.js', '**/*.d.ts'],
  },
];


