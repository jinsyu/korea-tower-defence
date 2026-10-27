// Addresses and the throwaway database of the E2E run. Not the development ports (web 3129, game server 4000).
import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_WEB = "http://localhost:3150";
/** The game server's "domain" (first way of the connection order, D77). */
export const E2E_GAME_SERVER = "http://127.0.0.1:4150";
/** Stand-in for the server's Caddy IP site: /ktd/* goes to the game server (second way). */
export const E2E_IP_GATE = "http://localhost:4152";
export const E2E_IP_ROUTE = `${E2E_IP_GATE}/ktd`;
/** Kills and starts the E2E game server (D58). */
export const E2E_SERVER_CONTROL = "http://127.0.0.1:4159";
export const E2E_DB_DIR = join(tmpdir(), "ktd-e2e-db");
export const E2E_DB_PATH = join(E2E_DB_DIR, "e2e.db");
/** The test server clock runs 60x: a wave every real second, an hour every real minute (D23). */
export const E2E_CLOCK_RATE = 60;
