import { changePower, newRegionWaves, replayStepwise, settle, WAVE_MS, type RegionWaves } from "@ktd/core";
import { readFileSync } from "node:fs";
import type { Db } from "./db";
import { DAY_MS } from "./dates";

const INDEX_URL = new URL("../../../data/source/gojang/regions/20261001/index.json", import.meta.url);

/** The 185 region codes a guardian can pick (same list the web map uses). */
export const REGION_CODES: ReadonlySet<string> = new Set(
  (JSON.parse(readFileSync(INDEX_URL, "utf8")) as { sigungu: { code: string }[] }).sigungu.map((r) => r.code),
);

export const POWER_LOG_DAYS = 30;
/** Power changes are pooled in memory and applied to the region rows this often (server time, spec "10초마다"). */
export const POWER_POOL_MS = 10_000;
/** A watched region reports each ended wave; after a longer gap than this it just jumps (no list). */
const MAX_REPORTED = BigInt(64);

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

/** One resolved wave, for the region broadcast (D23). */
export type EndedWave = { wave: number; held: boolean; startMs: number };

/** What the region should have: the sum of its guardians' powers and their number. */
export type RegionTruth = Map<string, { power: bigint; guardians: number }>;

export type Regions = ReturnType<typeof createRegions>;

/**
 * Region rows settled lazily with the core wave rules (spec "24시간 진행: 게으른 계산"). Power changes from guardians
 * are pooled in memory and applied every 10 seconds: a change settles the region up to that moment first and takes
 * effect from the next wave. Every applied change is logged, so the log replays to the stored state.
 * Functions that write run inside the caller's (batched) transaction.
 */
export function createRegions(db: Db) {
  const q = {
    get: db.prepare<[string], RegionRow>("SELECT * FROM regions WHERE code = ?"),
    all: db.prepare<[], RegionRow>("SELECT * FROM regions"),
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

  /** Power and guardian count changes not yet applied, per region. */
  let pool = new Map<string, { delta: bigint; guardians: number }>();
  /** Regions someone is watching: waves ended from `reportedUntil` (a wave start) on are collected for the broadcast. */
  const watched = new Map<string, { reportedUntil: bigint; ended: EndedWave[] }>();

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

  /** Settle a record to `now`. A watched region resolves wave by wave (same result, D18) and keeps the new ones. */
  function settleRecord(rec: RegionRecord, now: number): RegionRecord {
    const at = BigInt(now);
    const w = watched.get(rec.code);
    if (!w || (at - rec.waveStartMs) / WAVE_MS > MAX_REPORTED) {
      const out = { ...rec, ...settle(rec, at) };
      if (w && out.waveStartMs > w.reportedUntil) w.reportedUntil = out.waveStartMs;
      return out;
    }
    const out = {
      ...rec,
      ...replayStepwise(rec, [], at, (step) => {
        if (step.startMs >= w.reportedUntil) w.ended.push({ wave: Number(step.wave), held: step.blocked, startMs: Number(step.startMs) });
      }),
    };
    if (out.waveStartMs > w.reportedUntil) w.reportedUntil = out.waveStartMs;
    return out;
  }

  /** The region settled to `now` (a region nobody has picked yet starts at wave 1 now). Writes nothing. */
  function settled(code: string, now: number): RegionRecord {
    const row = q.get.get(code);
    if (!row) return { code, guardianCount: 0, ...newRegionWaves(BigInt(now)) };
    return settleRecord(toRecord(row), now);
  }

  /** Set the power for the waves after the one in progress, from `now`, and log it. */
  function setNextPower(before: RegionRecord, power: bigint, guardianCount: number, now: number): RegionRecord {
    const next: RegionRecord = { ...before, ...changePower(before, BigInt(now), power), guardianCount };
    write(next);
    q.log.run(next.code, now, power.toString());
    return next;
  }

  /** A guardian's power joins (+), leaves (−) or grows (0); applied with the next pool flush (`applyPool`). */
  function shiftPower(code: string, delta: bigint, guardians: 1 | 0 | -1): void {
    const p = pool.get(code) ?? { delta: BigInt(0), guardians: 0 };
    p.delta += delta;
    p.guardians += guardians;
    pool.set(code, p);
  }

  /** Apply the pooled changes: one settle and one row write per region, however many guardians changed (spec). */
  function applyPool(now: number): void {
    const applying = pool;
    pool = new Map();
    for (const [code, { delta, guardians }] of applying) {
      if (delta === BigInt(0) && guardians === 0) continue;
      const before = settled(code, now);
      setNextPower(before, before.nextPower + delta, before.guardianCount + guardians, now);
    }
  }

  /** Settle a region and store it when waves ended since it was stored. */
  function save(code: string, now: number): RegionRecord {
    const row = q.get.get(code);
    if (!row) return settled(code, now);
    const out = settleRecord(toRecord(row), now);
    if (out.waveStartMs !== BigInt(row.wave_started_at)) write(out);
    return out;
  }

  /**
   * After a restart (pooled changes lost with the process) and every hour: apply the pool, then set any region whose
   * power or guardian count differs from its guardians, from the next wave.
   */
  function reconcile(truth: RegionTruth, now: number): number {
    applyPool(now);
    let fixed = 0;
    const codes = new Set([...q.all.all().map((r) => r.code), ...truth.keys()]);
    for (const code of codes) {
      const want = truth.get(code) ?? { power: BigInt(0), guardians: 0 };
      const before = settled(code, now);
      if (before.nextPower === want.power && before.guardianCount === want.guardians) continue;
      setNextPower(before, want.power, want.guardians, now);
      fixed += 1;
    }
    return fixed;
  }

  /** Rank by best wave: 1 + regions with a higher best wave. Settles every stored region (nothing is written). */
  function ranks(now: number): (best: bigint) => number {
    const bests = q.all.all().map((r) => settleRecord(toRecord(r), now).best);
    return (best) => 1 + bests.filter((b) => b > best).length;
  }

  /** Start collecting ended waves of a region from the wave in progress. */
  function watch(code: string, now: number): void {
    if (watched.has(code)) return;
    const row = q.get.get(code);
    const start = row ? settle(toRecord(row), BigInt(now)).waveStartMs : BigInt(now);
    watched.set(code, { reportedUntil: start, ended: [] });
  }

  const unwatch = (code: string) => void watched.delete(code);

  /** Waves ended since the last call (watched regions only). */
  function takeEnded(code: string): EndedWave[] {
    const w = watched.get(code);
    if (!w) return [];
    const out = w.ended;
    w.ended = [];
    return out;
  }

  const trimLog = (now: number) => q.trimLog.run(now - POWER_LOG_DAYS * DAY_MS);

  return { settled, shiftPower, applyPool, save, reconcile, ranks, watch, unwatch, takeEnded, trimLog };
}
