import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Prefer a preinstalled Chromium when one is provided (e.g. sandboxed CI
// images), instead of downloading the revision this Playwright version pins.
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH
  || (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : null);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 6_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4317",
    browserName: "chromium",
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 4317",
    url: "http://127.0.0.1:4317",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
