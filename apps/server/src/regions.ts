import { changePower, newRegionWaves, settle, type RegionWaves } from "@ktd/core";
import { readFileSync } from "node:fs";
import type { Db } from "./db";
import { DAY_MS } from "./dates";

const INDEX_URL = new URL("../../../data/source/gojang/regions/20261001/index.json", import.meta.url);

/** The 185 region codes a guardian can pick (same list the web map uses). */
export const REGION_CODES: ReadonlySet<string> = new Set(
  (JSON.parse(readFileSync(INDEX_URL, "utf8")) as { sigungu: { code: string }[] }).sigungu.map((r) => r.code),
);

export const POWER_LOG_DAYS = 30;

type RegionRow = {
  code: string;
  wave: number;
  wave_started_at: number;
  power: string;
  next_power: string;
  best_wave: number;
  breaches: number;
  guardian_count: number;
};

export type RegionRecord = RegionWaves & { code: string; guardianCount: number };

export type Regions = ReturnType<typeof createRegions>;

/**
 * Region rows settled lazily with the core wave rules. A power change settles up to that moment first and
 * takes effect from the next wave (spec "24시간 진행: 게으른 계산"). Runs inside the caller's transaction.
 */
export function createRegions(db: Db) {
  const q = {
    get: db.prepare<[string], RegionRow>("SELECT * FROM regions WHERE code = ?"),
    upsert: db.prepare(
      `INSERT INTO regions (code, wave, wave_started_at, power, next_power, best_wave, breaches, guardian_count)
       VALUES (@code, @wave, @wave_started_at, @power, @next_power, @best_wave, @breaches, @guardian_count)
       ON CONFLICT(code) DO UPDATE SET wave = excluded.wave, wave_started_at = excluded.wave_started_at,
         power = excluded.power, next_power = excluded.next_power, best_wave = excluded.best_wave,
         breaches = excluded.breaches, guardian_count = excluded.guardian_count`,
    ),
    log: db.prepare("INSERT INTO region_power_log (region, at, power) VALUES (?, ?, ?)"),
    trimLog: db.prepare("DELETE FROM region_power_log WHERE at < ?"),
  };

  const toRecord = (r: RegionRow): RegionRecord => ({
    code: r.code,
    wave: BigInt(r.wave),
    waveStartMs: BigInt(r.wave_started_at),
    power: BigInt(r.power),
    nextPower: BigInt(r.next_power),
    best: BigInt(r.best_wave),
    breaches: BigInt(r.breaches),
    guardianCount: r.guardian_count,
  });

  function write(r: RegionRecord) {
    q.upsert.run({
      code: r.code,
      wave: Number(r.wave),
      wave_started_at: Number(r.waveStartMs),
      power: r.power.toString(),
      next_power: r.nextPower.toString(),
      best_wave: Number(r.best),
      breaches: Number(r.breaches),
      guardian_count: r.guardianCount,
    });
  }

  /** The region settled to `now` (a region nobody has picked yet starts at wave 1 now). */
  function settled(code: string, now: number): RegionRecord {
    const row = q.get.get(code);
    if (!row) return { code, guardianCount: 0, ...newRegionWaves(BigInt(now)) };
    const rec = toRecord(row);
    return { ...rec, ...settle(rec, BigInt(now)) };
  }

  /** A guardian's power joins (+) or leaves (−) the region from the next wave; the guardian count follows. */
  function shiftPower(code: string, delta: bigint, guardians: 1 | -1, now: number): RegionRecord {
    const before = settled(code, now);
    const next: RegionRecord = {
      ...before,
      ...changePower(before, BigInt(now), before.nextPower + delta),
      guardianCount: before.guardianCount + guardians,
    };
    write(next);
    q.log.run(code, now, next.nextPower.toString());
    return next;
  }

  const trimLog = (now: number) => q.trimLog.run(now - POWER_LOG_DAYS * DAY_MS);

  return { settled, shiftPower, trimLog };
}
