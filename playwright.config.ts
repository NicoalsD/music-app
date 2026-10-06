import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env['CI'] ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:4173/music-app/', trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm preview',
    url: 'http://127.0.0.1:4173/music-app/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
