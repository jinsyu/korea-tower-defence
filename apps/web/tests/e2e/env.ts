// Addresses and the throwaway database of the E2E run. Not the development ports (web 3129, game server 4000).
import { tmpdir } from "node:os";
import { join } from "node:path";

export const E2E_WEB = "http://localhost:3150";
export const E2E_GAME_SERVER = "http://127.0.0.1:4150";
export const E2E_DB_DIR = join(tmpdir(), "ktd-e2e-db");
