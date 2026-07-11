import { defineConfig, devices } from "@playwright/test";

// Accessibility (axe-core) regression gate. A single Chromium project scans the
// built site served by `vite preview` on a unique port, in dark + light themes.
const PORT = 4262;
const BASE = "/crypto-lab-otp-vault/";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    colorScheme: "dark",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
