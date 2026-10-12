module.exports = {
  testEnvironment: 'node',
  // Env vars must exist before any test module (and so before src/app) loads.
  setupFiles: ['<rootDir>/tests/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  // One in-memory replica set is started once and shared by every suite;
  // transactions need a replica set, and starting one per file is slow.
  globalSetup: '<rootDir>/tests/globalSetup.js',
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  testTimeout: 30_000,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/config/swagger.js'],
  // Suites share one database, so they must not run concurrently.
  maxWorkers: 1,
};
