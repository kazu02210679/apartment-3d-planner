import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Vitest owns *.test.ts; Playwright owns only functional *.spec.ts files.
  testMatch: '**/*.spec.ts',
  outputDir: 'node_modules/.cache/playwright/test-results',
  // The fixed 100-object acceptance benchmark must run without competing
  // Chromium render processes so its page-side timing remains reproducible.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/evidence.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'evidence',
      testMatch: '**/evidence.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run build && tsx scripts/serve-dist.ts',
      url: 'http://127.0.0.1:4173/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'tsx scripts/serve-dist.ts --port=4174 --prefix-only',
      url: 'http://127.0.0.1:4174/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
