import { defineConfig, devices } from "@playwright/test";

const deployed = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  webServer:
    deployed ? undefined : (
      {
        command: "node scripts/local-server.ts",
        url: "http://127.0.0.1:4173/version",
        reuseExistingServer: false,
        timeout: 120_000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
      }
    ),
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "public",
      testMatch: "**/public.pw.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "journey",
      testMatch: ["**/journey.pw.ts", "**/account.pw.ts"],
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-webkit",
      testMatch: "**/*.pw.ts",
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],
});
