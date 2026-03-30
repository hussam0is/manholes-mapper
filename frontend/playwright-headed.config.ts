import { defineConfig, devices } from '@playwright/test';

/**
 * Headed test config — assumes dev server is already running on :5173
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,  // sequential for headed visibility
  retries: 0,
  workers: 1,
  reporter: [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: false,
    launchOptions: {
      slowMo: 300,  // slow down so you can see actions
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
});
