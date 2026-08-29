import { defineConfig, devices } from "@playwright/test";

/**
 * The seven widths the audit asked for. They are real device classes, not
 * round numbers: 320 is the smallest phone still in use, 360 and 390 are the
 * Android and iPhone majority, 430 is a Pro Max, 768 is a portrait tablet,
 * 1024 a landscape tablet or small laptop, 1440 a desktop.
 *
 * Each becomes its own project so a failure names the width it happened at.
 */
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440];

export default defineConfig({
  testDir: "./e2e",
  // A layout assertion that needs a retry is a flaky assertion.
  retries: 0,
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: WIDTHS.map((width) => ({
    name: `w${width}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width, height: width < 768 ? 844 : 900 },
      isMobile: false,
      // The sandbox that built this ships Chromium at a fixed path and blocks
      // `playwright install`; on a normal machine this env var is unset and
      // Playwright uses its own download.
      launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
        : {},
    },
  })),
});
