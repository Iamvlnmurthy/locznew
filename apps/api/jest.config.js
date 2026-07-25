/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  // Matches both unit specs and the e2e contract suite.
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
  // Runs before any import: the config module validates the environment at import time.
  setupFiles: ['<rootDir>/test/setup-env.ts'],

  transform: {
    // SWC rather than ts-jest: ts-jest cannot drive TypeScript 7's native compiler, and
    // transpiling without type-checking is the right trade anyway — `npm run typecheck`
    // is the authority on types, and SWC is roughly an order of magnitude faster.
    // .js too, so the ESM-only dependencies allowed through transformIgnorePatterns
    // below get converted to CommonJS for Jest's runtime.
    '^.+\\.[tj]s$': [
      '@swc/jest',
      {
        jsc: {
          target: 'es2023',
          parser: { syntax: 'typescript', decorators: true },
          // NestJS dependency injection reads design-time parameter types from the
          // emitted metadata, so both of these are required, not optional.
          transform: { legacyDecorator: true, decoratorMetadata: true },
        },
        module: { type: 'commonjs' },
      },
    ],
  },

  // uuid v14 is ESM-only. Node 24 can require() it, but Jest's CommonJS runtime cannot,
  // so it is transpiled here rather than swapped for a hand-rolled generator.
  transformIgnorePatterns: ['/node_modules/(?!(uuid|meilisearch)/)'],

  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  testTimeout: 20000,
};
