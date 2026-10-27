import { lookKey, parseStageFile, TOWER_TYPES } from "@ktd/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FAKE_ME, fakeGuardians } from "./fake-region";
import {
  boardTowerInputs,
  createMeStore,
  levelUpText,
  meBarView,
  meScreenView,
  openColors,
  PREVIEW_STEPS,
  repRows,
  STANCES,
  STAT_KEYS,
  statsOf,
  withPal,
  withStance,
  withType,
} from "./me-store";

const stage = parseStageFile(
  JSON.parse(readFileSync(new URL("../../../public/stages/dev/32540.json", import.meta.url), "utf8")),
);
const guardians = fakeGuardians(400);

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe("my-guardian screen view (D53)", () => {
  it("shows level, points to the next level and step, step and the next look", () => {
    const v = meScreenView(FAKE_ME);
    expect(v).toMatchObject({ level: 23, step: 47, colorsOpen: 3, toDecoration: 3 });
    expect(v.toUpgrade).toBeGreaterThan(0);
    expect(v.toLevel).toBeGreaterThan(0);
    expect(v.next?.text).toBe("50단계에 청동 타워 · 초록 테두리");
  });

  it("previews the 7 thresholds 1·10·25·50·100·200·500 and every one looks different", () => {
    expect(PREVIEW_STEPS.map(([s]) => s)).toEqual([1, 10, 25, 50, 100, 200, 500]);
    for (const type of TOWER_TYPES) {
      const keys = PREVIEW_STEPS.map(([s]) => lookKey(type, s));
      expect(new Set(keys).size).toBe(7);
    }
  });

  it("marks exactly the last threshold I have reached", () => {
    expect(meScreenView(FAKE_ME).previews.filter((p) => p.now).map((p) => p.step)).toEqual([25]);
    expect(meScreenView({ ...FAKE_ME, step: 500 }).previews.filter((p) => p.now).map((p) => p.step)).toEqual([500]);
    expect(meScreenView({ ...FAKE_ME, step: 500 }).next).toBeNull();
  });
});

describe("stats and stance", () => {
  it("gives one point per level after the first, whatever the stance", () => {
    for (const stance of STANCES) {
      for (const level of [1, 2, 7, 23, 120]) expect(sum(statsOf(level, stance))).toBe(level - 1);
    }
  });

  it("deals points in turn for 골고루 and 2 : 1 : 1 : 1 for a one-stat stance", () => {
    expect(statsOf(9, "bal")).toEqual({ pow: 2, spd: 2, rng: 2, luck: 2 });
    expect(statsOf(11, "spd")).toEqual({ pow: 2, spd: 4, rng: 2, luck: 2 });
  });

  it("names the stat that got the level-up point", () => {
    for (const stance of STANCES) {
      for (let level = 2; level < 40; level++) {
        const now = statsOf(level, stance);
        const before = statsOf(level - 1, stance);
        const gained = STAT_KEYS.filter((k) => now[k] === before[k] + 1);
        expect(gained).toHaveLength(1);
        expect(levelUpText(level, stance)).toContain(`+1`);
      }
    }
    expect(levelUpText(3, "luck")).toBe("레벨 3! 행운 +1");
    expect(levelUpText(2, "bal")).toBe("레벨 2! 힘 +1");
  });
});

describe("colours open every 10 levels", () => {
  it("opens 1 at the start, one more every 10 levels, 12 at most", () => {
    expect(openColors(1)).toBe(1);
    expect(openColors(9)).toBe(1);
    expect(openColors(10)).toBe(2);
    expect(openColors(110)).toBe(12);
    expect(openColors(500)).toBe(12);
  });

  it("ignores a locked colour", () => {
    expect(withPal(FAKE_ME, 2).pal).toBe(2);
    expect(withPal(FAKE_ME, 3)).toBe(FAKE_ME);
  });
});

describe("choices go through the one store (D53, plan memo)", () => {
  it("changing type, stance and colour changes the store, and the board, list and bar follow it", () => {
    const store = createMeStore(FAKE_ME);
    let calls = 0;
    store.subscribe(() => calls++);

    store.set(withType(store.get(), "splash"));
    store.set(withStance(store.get(), "luck"));
    store.set(withPal(store.get(), 2));
    expect(calls).toBe(3);
    const me = store.get();
    expect(me).toMatchObject({ type: "splash", stance: "luck", pal: 2 });

    const mine = boardTowerInputs(stage, guardians, me).find((t) => t.me)!;
    expect(mine).toMatchObject({ type: "splash", pal: 2, step: me.step });
    const row = repRows(guardians, me, stage.repSpots.length).find((r) => r.me)!;
    expect(row).toMatchObject({ type: "splash", pal: 2, step: me.step });
    expect(meBarView(me).step).toBe(me.step);
    expect(meScreenView(me).step).toBe(me.step);
    expect(meScreenView(me).stats).toEqual(statsOf(me.level, "luck"));
  });

  it("type, stance and colour never change the level, step or points", () => {
    const me = withPal(withStance(withType(FAKE_ME, "slow"), "rng"), 1);
    expect(me).toMatchObject({ level: FAKE_ME.level, step: FAKE_ME.step, xp: FAKE_ME.xp, wallet: FAKE_ME.wallet });
  });
});
