import { rmSync } from "node:fs";
import { E2E_DB_DIR } from "./env";

/** The test database goes with the run. The next run also starts from an empty folder. */
export default function teardown() {
  rmSync(E2E_DB_DIR, { recursive: true, force: true });
}
