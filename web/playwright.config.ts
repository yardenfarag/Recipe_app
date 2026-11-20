import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests (ADR 026). They run against local Supabase, never production: start it from the repo root with
 * `npx supabase start`, then `npm run test:e2e` here. e2e/env.ts reads the local URL and keys from the CLI.
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One at a time: the tests share one local server and one local Supabase, and parallel runs made them flaky.
  workers: 1,
  expect: { timeout: 10_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // A production build, so the tests see what ships. e2e/env.ts points it at local Supabase.
    command: `node e2e/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/app/auth`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
  },
});
