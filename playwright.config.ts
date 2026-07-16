import { defineConfig } from '@playwright/test';

// Live E2E against a deployed environment (default: staging).
// Requires real credentials:
//   E2E_BASE_URL   (default https://belarro-op-staging.vercel.app)
//   E2E_EMAIL      login email of a field/admin user
//   E2E_PASSWORD   that user's password
// Run: npx playwright test
export default defineConfig({
  testDir: './src/e2e',
  timeout: 60_000,
  retries: 1,
  workers: 1, // live DB — keep tests serial so they don't race each other
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://belarro-op-staging.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list']],
});
