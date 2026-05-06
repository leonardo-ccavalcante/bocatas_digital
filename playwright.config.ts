import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Bocatas Digital E2E.
 *
 * Scope (per Phase B.8 plan): family JTBD specs only.
 * - chromium-desktop  → 1280x720 desktop chromium
 * - chromium-mobile-moto-g4 → Moto G4 emulation (low-end Android target)
 *
 * Vitest is configured to ignore the e2e/ directory (vitest.config.ts
 * `include` only covers server/** and client/src/features/**), so vitest
 * and Playwright never collide.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["junit", { outputFile: "reports/e2e.xml" }],
  ],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "chromium-mobile-moto-g4",
      use: {
        ...devices["Moto G4"],
      },
    },
  ],
  webServer: {
    command: "pnpm dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
