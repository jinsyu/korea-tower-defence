import { defineConfig, devices } from "@playwright/test";
import { E2E_DB_DIR, E2E_GAME_SERVER, E2E_WEB } from "./tests/e2e/env";

// E2E runs its own game server (temp SQLite) and its own production web build on ports that no dev server uses
// (3129 and 4000 are the development ports). Both are stopped by Playwright when the run ends.
// The web build bakes the game server address in (NEXT_PUBLIC_RT_URLS), so `.next` is rebuilt for the test server.
const testServerEnv = {
  PORT: new URL(E2E_GAME_SERVER).port,
  HOST: "127.0.0.1",
  ALLOWED_ORIGIN: E2E_WEB,
  // A throwaway pepper for the throwaway database; never used outside this run.
  SESSION_SECRET: "e2e-only-secret-not-for-real-use-0123456789",
  DB_PATH: `${E2E_DB_DIR}/e2e.db`,
};

export default defineConfig({
  testDir: "./tests/e2e",
  globalTeardown: "./tests/e2e/teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: E2E_WEB,
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } } },
    { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: [
    {
      command: `rm -rf "${E2E_DB_DIR}" && mkdir -p "${E2E_DB_DIR}" && node --import tsx src/main.ts`,
      cwd: "../server",
      env: testServerEnv,
      url: `${E2E_GAME_SERVER}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm build && pnpm start -p ${new URL(E2E_WEB).port}`,
      env: { NEXT_PUBLIC_RT_URLS: E2E_GAME_SERVER },
      url: E2E_WEB,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
