import { defineConfig } from '@playwright/test';

// The browser tests run against the real site: support/site.js (globalSetup)
// builds it once per run, without fingerprints, and serves it on a free port;
// the tests reach it through `baseURL` (see support/fixtures.js), so a spec
// writes `page.goto('/en/')`. Chromium only, the way the site is measured.
//
// Everything a test could depend on is pinned here, and a spec that needs
// something else says so with `test.use(...)`: English, UTC, a light page,
// reduced motion (no animation to wait for; a spec about motion turns it back
// on), a 1280 x 900 window. `bypassCSP` stays off: the site must work under
// its own Content-Security-Policy.
export default defineConfig({
  testDir: './tests',
  globalSetup: './support/site.js',
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // The CI job keeps playwright-report/ and test-results/ when it fails.
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : [['list']],
  outputDir: './test-results',
  use: {
    locale: 'en-GB',
    timezoneId: 'UTC',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
