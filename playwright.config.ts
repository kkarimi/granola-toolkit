import { defineConfig } from "@playwright/test";

export default defineConfig({
  fullyParallel: false,
  reporter: "list",
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    viewport: {
      height: 900,
      width: 1440,
    },
  },
});
