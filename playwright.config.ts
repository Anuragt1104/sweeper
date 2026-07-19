import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    // Exercise the same standalone artifact and instrumentation path Railway runs.
    command: "npm run build && cp -R public .next/standalone/public && cp -R .next/static .next/standalone/.next/static && HOSTNAME=127.0.0.1 PORT=3100 SWEEPER_AUTO_START_LIVE=true SWEEPER_CONTROL_KEY=e2e-control TXLINE_MODE=simulation node .next/standalone/server.js",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
