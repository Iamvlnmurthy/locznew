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
      eqeqeq: ['error', 'always'],
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
