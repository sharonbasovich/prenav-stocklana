import { defineConfig, devices } from "@playwright/test";

const FRONTEND_PORT = 8471;
const BACKEND_PORT = 8420;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  workers: 2,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
    url: `http://localhost:${FRONTEND_PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      VITE_PROXY_TARGET: `http://localhost:${BACKEND_PORT}`,
    },
  },
});
