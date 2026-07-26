import { defineConfig, globalIgnores } from 'eslint/config';
import base from './packages/config/eslint.base.mjs';

export default defineConfig([
  ...base,
  globalIgnores([
    '**/.next/**',
    '**/dist/**',
    '**/build/**',
    '**/coverage/**',
    '**/node_modules/**',
    '**/next-env.d.ts',
    'apps/mobile/**',
  ]),
]);
