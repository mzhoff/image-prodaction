import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL ?? 'http://localhost:3004';
const origin = new URL(baseURL);
const localHeaders = origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)
  ? { 'x-forwarded-for': `10.${[...randomBytes(3)].join('.')}` }
  : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
      ]
    : [['list']],
  outputDir: 'test-results',
  timeout: 90_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    extraHTTPHeaders: localHeaders,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
