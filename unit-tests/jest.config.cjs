// Runs the unit tests in the `__tests__` directories under `../src`. The host
// apps' Jest setups run the same tests (e.g. `pnpm test` in kausal-watch-ui),
// so tests must not rely on anything that only exists here.
const path = require('node:path');

/** @type {import('jest').Config} */
module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@common/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(t|j)sx?$': [
      require.resolve('@swc/jest'),
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
};
