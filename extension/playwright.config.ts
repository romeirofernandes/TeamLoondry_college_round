import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  workers: 1,
  timeout: 45000,
  reporter: "list",
  webServer: {
    command: "node tests/fixture-server.cjs",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: true,
  },
});
