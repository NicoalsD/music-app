import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173/music-app/', trace: 'on-first-retry' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
  ],
  webServer: {
    // Run vite directly (no pnpm wrapper) so Playwright can stop it on teardown.
    command: 'node node_modules/vite/bin/vite.js preview',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 2_000 },
    url: 'http://127.0.0.1:4173/music-app/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
