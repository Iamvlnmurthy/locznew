import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Shared ESLint configuration.
 *
 * The rules that are errors rather than warnings are the ones that have real
 * consequences on this project: floating promises (a swallowed audit or queue write),
 * unsafe any (defeats the point of the shared types), and console logging (the API has
 * a structured logger; a stray console.log in a request path leaks user data).
 */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      /**
       * `null: 'ignore'` so `value != null` stays available.
       *
       * That comparison is the one place loose equality says something the strict form
       * cannot say in a single expression: "neither null nor undefined". The codebase uses it
       * where both are genuinely possible — an optional coordinate that may be absent from the
       * request or null in the database — and the strict rewrite is
       * `x !== null && x !== undefined` on every one of them, which is longer and easier to
       * get half-right. Every other loose comparison is still an error.
       */
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },
  {
    // Seeds and scripts legitimately print progress.
    files: ['**/prisma/seed.ts', '**/scripts/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.spec.ts', '**/test/**'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
);
