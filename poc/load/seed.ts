// Builds data/seed.db (50,000 guardians over 185 regions, skewed, one region with 2,000)
// and data/guardians.json for the load generator. Uses node:sqlite so the Mac needs no native build.
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { openDb, SCHEMA } from "./lib/db.ts";
import {
  BIG_REGION_SIZE,
  GUARDIAN_COUNT,
  REGION_COUNT,
  guardianId,
  guardianKey,
  levelFor,
  powerOf,
  regionCode,
  upgrade,
} from "./lib/game.ts";

const DATA_DIR = new URL("./data/", import.meta.url).pathname;
const DB_PATH = `${DATA_DIR}seed.db`;

function regionSizes(): number[] {
  // Region 0 has exactly 2,000; the rest follow 1/(i+10) so the largest stays below 2,000.
  const rest = GUARDIAN_COUNT - BIG_REGION_SIZE;
  const weights = Array.from({ length: REGION_COUNT - 1 }, (_, i) => 1 / (i + 10));
  const total = weights.reduce((a, b) => a + b, 0);
  const sizes = weights.map((w) => Math.floor((rest * w) / total));
  let left = rest - sizes.reduce((a, b) => a + b, 0);
  for (let i = 0; left > 0; i++, left--) sizes[i % sizes.length]++;
  return [BIG_REGION_SIZE, ...sizes];
}

let rngState = 42;
const rand = () => {
  rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
  return rngState / 0x7fffffff;
};

mkdirSync(DATA_DIR, { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) rmSync(DB_PATH + suffix, { force: true });
const db = openDb(DB_PATH, "node", "NORMAL");
db.exec(SCHEMA);

const now = Date.now();
const sizes = regionSizes();
const insertGuardian = db.prepare(
  "INSERT INTO guardians VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
);
const insertRegion = db.prepare("INSERT INTO regions VALUES (?,?,?,?,?,?,?,?,?,?)");
const list: [string, string][] = [];
let n = 0;
db.transaction(() => {
  sizes.forEach((size, r) => {
    const code = regionCode(r);
    let regionPower = 0;
    for (let k = 0; k < size; k++, n++) {
      const id = guardianId(n);
      const points = Math.floor(-Math.log(1 - rand()) * 2000);
      const level = levelFor(points);
      const { stage, wallet } = upgrade(1, points);
      const power = powerOf(level, stage);
      regionPower += power;
      const keyHash = createHash("sha256").update(guardianKey(id)).digest("hex");
      insertGuardian.run(id, keyHash, n % 5000, 1 + (n % 3), code, points, wallet, level, stage, power, 1, 0, 0, 0, now);
      list.push([id, code]);
    }
    // Waves start two hours in the past so the server's first settle walks ~120 waves.
    insertRegion.run(code, 1, now - 2 * 3600_000, regionPower, regionPower, 0, 0, size, 0, 0);
  });
});
db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
db.close();
writeFileSync(`${DATA_DIR}guardians.json`, JSON.stringify(list));
console.log(`seeded ${n} guardians in ${sizes.length} regions (max ${Math.max(...sizes)}, min ${Math.min(...sizes)}) → ${DB_PATH}`);
