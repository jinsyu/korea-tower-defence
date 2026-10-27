import { defineConfig, devices } from "@playwright/test";
import {
  E2E_CLOCK_RATE,
  E2E_DB_DIR,
  E2E_DB_PATH,
  E2E_GAME_SERVER,
  E2E_IP_GATE,
  E2E_IP_ROUTE,
  E2E_SERVER_CONTROL,
  E2E_WEB,
} from "./tests/e2e/env";

// E2E runs its own game server (temp SQLite, 60x clock), a stand-in for the server's Caddy IP site, and its own
// production web build on ports that no dev server uses (3129 and 4000 are the development ports). All are stopped by
// Playwright when the run ends. The web build bakes the game server addresses in (NEXT_PUBLIC_RT_URLS: domain, IP
// path), so `.next` is rebuilt for the test servers.
const testServerEnv = {
  PORT: new URL(E2E_GAME_SERVER).port,
  HOST: "127.0.0.1",
  ALLOWED_ORIGIN: E2E_WEB,
  // A throwaway pepper for the throwaway database; never used outside this run.
  SESSION_SECRET: "e2e-only-secret-not-for-real-use-0123456789",
  DB_PATH: E2E_DB_PATH,
  TEST_CLOCK_RATE: String(E2E_CLOCK_RATE),
  // Fixed for the run, so a restarted server goes on from the same server time (D57, D58).
  TEST_CLOCK_FROM_MS: String(Date.now()),
  CONTROL_PORT: new URL(E2E_SERVER_CONTROL).port,
};

const viewports = [
  { name: "mobile-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 } } },
  { name: "desktop-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
];

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
    ...viewports.map((p) => ({ ...p, grepInvert: /@restart/ })),
    // Kills the shared game server: runs alone, after everything else.
    { name: "restart", use: viewports[1]!.use, grep: /@restart/, dependencies: viewports.map((p) => p.name) },
  ],
  webServer: [
    {
      command: `rm -rf "${E2E_DB_DIR}" && mkdir -p "${E2E_DB_DIR}" && node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/e2e/game-server.ts`,
      env: testServerEnv,
      url: `${E2E_GAME_SERVER}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/e2e/ip-gate.ts",
      env: { GATE_PORT: new URL(E2E_IP_GATE).port, GATE_PREFIX: new URL(E2E_IP_ROUTE).pathname, GATE_TARGET: E2E_GAME_SERVER },
      url: `${E2E_IP_ROUTE}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `pnpm build && pnpm start -p ${new URL(E2E_WEB).port}`,
      env: { NEXT_PUBLIC_RT_URLS: `${E2E_GAME_SERVER},${E2E_IP_ROUTE}` },
      url: E2E_WEB,
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
