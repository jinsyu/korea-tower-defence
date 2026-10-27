// D23: the screen shows the server's waves. On the 60x test clock (a wave every real second) the page watches 100
// waves; every wave's number and "막음 / 방어선 재정비" on the page must be the server's, which is the region's power
// log replayed wave by wave from the test database (the same rules the server settles with).
import { newRegionWaves, replayStepwise, WAVE_MS, waveAfter } from "@ktd/core";
import { expect, test } from "@playwright/test";
import { DatabaseSync } from "node:sqlite";
import { E2E_DB_PATH } from "./env";
import { hudWave, newGuardian, openPlay, parseLine, shown } from "./live";

const WAVES = 100;
/** A region no other test uses, one per viewport. */
const REGION: Record<string, string> = { "mobile-360": "11020", "desktop-1440": "11030" };

/** The server's record: every wave of the region, from its power log. */
function serverWaves(region: string, untilMs: number) {
  const db = new DatabaseSync(E2E_DB_PATH, { readOnly: true });
  const log = db.prepare("SELECT at, power FROM region_power_log WHERE region = ? ORDER BY rowid").all(region) as { at: number; power: string }[];
  db.close();
  const waves = new Map<number, { wave: number; held: boolean }>();
  replayStepwise(
    newRegionWaves(BigInt(log[0]!.at)),
    log.map((l) => ({ atMs: BigInt(l.at), power: BigInt(l.power) })),
    BigInt(untilMs),
    (s) => void waves.set(Number(s.startMs), { wave: Number(s.wave), held: s.blocked }),
  );
  return waves;
}

test("D23: the wave within 2 s of opening, then 100 waves on the 60x clock exactly as the server resolved them", async ({ page, request }, info) => {
  test.setTimeout(240_000);
  const region = REGION[info.project.name]!;
  // Two new towers: power 20 holds up to wave 9, so the region keeps holding and breaking through (and meets a boss).
  const key = await newGuardian(request, region);
  await newGuardian(request, region, 2);

  const opened = Date.now();
  await openPlay(page, key);
  await expect(hudWave(page)).toHaveAttribute("data-value", /^\d/, { timeout: 2000 });
  expect(Date.now() - opened).toBeLessThan(2000 + 1000);

  await expect.poll(async () => (await shown(page)).log.length, { timeout: 200_000, intervals: [1000] }).toBeGreaterThanOrEqual(WAVES);
  const { log, hud } = await shown(page);
  const last = log.at(-1)!;
  const server = serverWaves(region, last.start + Number(WAVE_MS));

  // Every wave from the first one seen, none skipped, each with the server's number and result.
  const step = Number(WAVE_MS);
  log.forEach((line, i) => {
    expect(line.start, `wave line ${i} follows the one before`).toBe(log[0]!.start + i * step);
    expect(parseLine(line.text), `wave starting ${line.start}`).toEqual(server.get(line.start));
  });
  const results = log.map((l) => parseLine(l.text));
  expect(results.some((r) => r.held) && results.some((r) => !r.held)).toBe(true);

  // The scoreboard showed the wave in progress, then the server's next wave after each one ended.
  const expected = [results[0]!.wave, ...results.map((r) => Number(waveAfter(BigInt(r.wave), r.held)))];
  const dedupe = (xs: number[]) => xs.filter((x, i) => i === 0 || x !== xs[i - 1]);
  const hudWaves = dedupe(hud.filter((v) => /^\d/.test(v)).map((v) => Number(v.replace(/,/g, ""))));
  expect(hudWaves.slice(0, dedupe(expected).length)).toEqual(dedupe(expected));
});
