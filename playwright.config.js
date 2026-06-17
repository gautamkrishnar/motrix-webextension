'use strict';

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/specs',

  timeout: 120_000,

  // Dynamic port allocation per worker (see fixtures/chrome-extension.js)
  // allows parallel execution across test files.
  // Tests within a file run sequentially (they share mock state).
  workers: process.env.CI ? 2 : 4,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ...(process.env.CI ? [
      ['github'],
      ['junit', { outputFile: 'test-results/junit.xml' }],
      ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ] : []),
  ],

  projects: [
    {
      name: 'chrome',
      testMatch: '**/chrome/**/*.test.js',
      // Chrome binary is specified via executablePath in the test's beforeAll.
      // CHROME_BIN env var overrides the default path for CI environments.
    },
    {
      name: 'firefox',
      testMatch: '**/firefox/**/*.test.js',
    },
  ],
});
