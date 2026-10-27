import { describe, expect, it } from "vitest";
import { TOWER_TYPES } from "../looks.ts";
import { createRng } from "../math/random.ts";
import { findFloatUse } from "./integer-check.ts";
import {
  PACE_300_MAX_STAGE_365,
  PACE_BOT_300,
  PACE_BOT_50,
  PACE_FIRST_ANSWERS,
  PACE_STAGE_TARGETS,
  paceTarget,
  runPaceBot,
} from "./pace-bot.ts";
import {
  BASE_POWER_1,
  NEW_GROWTH,
  STATS,
  TENDENCIES,
  addPoints,
  answerPoints,
  basePower,
  dailyRatePercent,
  levelOf,
  levelThreshold,
  splitStats,
  statPointsOf,
  towerPower,
  upgradeCost,
  type Growth,
} from "./progress.ts";
import { H0, WAVE_MS, WAVE_SECONDS, newRegionWaves, settle } from "./waves.ts";

const B = BigInt;
const pow = (base: bigint, exp: number): bigint => base ** B(exp);
const sumStats = (s: Record<string, bigint>) => Object.values(s).reduce((a, b) => a + b, 0n);
const growthAfter = (points: number[]): Growth => points.reduce((g, p) => addPoints(g, B(p)), NEW_GROWTH);

describe("answer points and the daily cut-down", () => {
  it("pays 10 / 12 / 15 by problem level", () => {
    expect([1, 2, 3].map((l) => answerPoints(l as 1 | 2 | 3, 1n))).toEqual([10n, 12n, 15n]);
  });

  it("pays 100% up to the 150th, 50% up to the 300th, then 10%, rounded down", () => {
    expect([1n, 150n, 151n, 300n, 301n, 5000n].map(dailyRatePercent)).toEqual([100n, 100n, 50n, 50n, 10n, 10n]);
    expect([1, 2, 3].map((l) => answerPoints(l as 1 | 2 | 3, 151n))).toEqual([5n, 6n, 7n]);
    expect([1, 2, 3].map((l) => answerPoints(l as 1 | 2 | 3, 301n))).toEqual([1n, 1n, 1n]);
  });
});

describe("level table (D45)", () => {
  it("level 1 is 0 and level n is ceil(50 × n^1.6), exactly", () => {
    expect(levelThreshold(1n)).toBe(0n);
    for (let n = 2n; n <= 1000n; n++) {
      const c = levelThreshold(n);
      const target = pow(50n, 5) * n ** 8n; // c ≥ 50 n^1.6 ⇔ c^5 ≥ 50^5 n^8
      expect(c ** 5n >= target && (c - 1n) ** 5n < target).toBe(true);
    }
    // Close to the float formula, but exact where floats are not: 32^1.6 = 256, and Math.ceil(50 × 32 ** 1.6) gives 12801.
    expect(levelThreshold(32n)).toBe(12800n);
    for (let n = 2; n <= 300; n++) {
      const gap = Number(levelThreshold(B(n))) - 50 * n ** 1.6;
      expect(gap > -1e-6 && gap < 1).toBe(true);
    }
  });

  it("needs strictly more points for every next level", () => {
    for (let n = 1n; n < 3000n; n++) expect(levelThreshold(n + 1n) > levelThreshold(n)).toBe(true);
  });

  it("levelOf finds the level at and just below each threshold", () => {
    expect(levelOf(0n)).toBe(1n);
    for (let n = 2n; n <= 800n; n++) {
      expect(levelOf(levelThreshold(n))).toBe(n);
      expect(levelOf(levelThreshold(n) - 1n)).toBe(n - 1n);
    }
  });

  it("gives one stat point per level-up", () => {
    let g = NEW_GROWTH;
    for (let i = 0; i < 3000; i++) {
      const next = addPoints(g, 12n);
      const gained = next.level - g.level;
      expect(statPointsOf(next.level) - statPointsOf(g.level)).toBe(gained);
      expect(sumStats(splitStats(statPointsOf(next.level), "balanced"))).toBe(next.level - 1n);
      g = next;
    }
    expect(g.level > 50n).toBe(true);
  });
});

describe("upgrade cost and tower base power", () => {
  it("costs ceil(10 × s^1.1) to go from s to s + 1, exactly", () => {
    expect([1n, 2n, 3n].map(upgradeCost)).toEqual([10n, 22n, 34n]);
    for (let s = 1n; s <= 2000n; s++) {
      const c = upgradeCost(s);
      const target = pow(10n, 10) * s ** 11n;
      expect(c ** 10n >= target && (c - 1n) ** 10n < target).toBe(true);
    }
    for (let s = 1; s <= 500; s++) {
      const gap = Number(upgradeCost(B(s))) - 10 * s ** 1.1;
      expect(gap > -1e-6 && gap < 1).toBe(true);
    }
  });

  it("B(1) = 10 and B(s + 1) = ceil(B(s) × 105 / 100), past 2^53 without rounding", () => {
    expect(basePower(1n)).toBe(BASE_POWER_1);
    expect(BASE_POWER_1 * WAVE_SECONDS).toBe(H0); // a new guardian alone exactly blocks wave 1
    let b = BASE_POWER_1;
    for (let s = 2n; s <= 1500n; s++) {
      b = (b * 105n + 99n) / 100n;
      expect(basePower(s)).toBe(b);
    }
    expect(b > 2n ** 53n).toBe(true);
  });

  it("rejects stages and levels below 1", () => {
    expect(() => upgradeCost(0n)).toThrow(RangeError);
    expect(() => basePower(0n)).toThrow(RangeError);
    expect(() => levelThreshold(0n)).toThrow(RangeError);
  });
});

describe("automatic upgrades", () => {
  it("adds points to both the total and the wallet", () => {
    expect(addPoints(NEW_GROWTH, 9n)).toEqual({ total: 9n, wallet: 9n, level: 1n, stage: 1n });
  });

  it("upgrades as soon as the wallet covers the cost, several stages at once, keeping the rest", () => {
    expect(addPoints(NEW_GROWTH, 10n)).toEqual({ total: 10n, wallet: 0n, level: 1n, stage: 2n });
    // 10 + 22 + 34 = 66 reaches stage 4; 5 more is not enough for 46.
    expect(addPoints(NEW_GROWTH, 71n)).toEqual({ total: 71n, wallet: 5n, level: 1n, stage: 4n });
  });

  it("rejects negative points", () => {
    expect(() => addPoints(NEW_GROWTH, -1n)).toThrow(RangeError);
  });
});

describe("stat split by tendency (D46)", () => {
  it("balanced hands points to the four stats in turn", () => {
    expect(splitStats(0n, "balanced")).toEqual({ power: 0n, speed: 0n, range: 0n, luck: 0n });
    expect(splitStats(1n, "balanced")).toEqual({ power: 1n, speed: 0n, range: 0n, luck: 0n });
    expect(splitStats(3n, "balanced")).toEqual({ power: 1n, speed: 1n, range: 1n, luck: 0n });
    expect(splitStats(9n, "balanced")).toEqual({ power: 3n, speed: 2n, range: 2n, luck: 2n });
  });

  it("one-stat tendencies give that stat 2 : the others 1 each", () => {
    for (const focus of STATS) {
      for (const cycles of [1n, 7n, 40n]) {
        const s = splitStats(5n * cycles, focus);
        for (const stat of STATS) expect(s[stat]).toBe(stat === focus ? 2n * cycles : cycles);
      }
    }
    expect(splitStats(2n, "luck")).toEqual({ power: 0n, speed: 0n, range: 0n, luck: 2n });
    expect(splitStats(4n, "speed")).toEqual({ power: 1n, speed: 2n, range: 1n, luck: 0n });
  });

  it("changing the tendency re-splits earned points and keeps the sum", () => {
    for (let points = 0n; points <= 200n; points++) {
      for (const tendency of TENDENCIES) expect(sumStats(splitStats(points, tendency))).toBe(points);
    }
    expect(splitStats(10n, "range")).toEqual({ power: 2n, speed: 2n, range: 4n, luck: 2n });
    expect(splitStats(10n, "balanced")).toEqual({ power: 3n, speed: 3n, range: 2n, luck: 2n });
  });
});

describe("tower power (D47)", () => {
  it("is the same for all 3 types × 5 tendencies at the same points and stage", () => {
    const samples = [NEW_GROWTH, growthAfter([350]), growthAfter(Array(500).fill(12)), growthAfter(Array(20000).fill(15))];
    for (const g of samples) {
      const powers = TOWER_TYPES.flatMap((towerType) =>
        TENDENCIES.map((tendency) => towerPower({ stage: g.stage, level: g.level, tendency, towerType })),
      );
      expect(powers).toHaveLength(15);
      expect(new Set(powers).size).toBe(1);
      expect(powers[0]).toBe((basePower(g.stage) * (100n + 2n * (g.level - 1n))) / 100n);
    }
  });
});

describe("a breach never touches the child (D20)", () => {
  it("region breaches leave points, level, stats, stage and wallet as they were", () => {
    const growth = Object.freeze(growthAfter(Array(40).fill(12)));
    const before = { ...growth };
    const stats = splitStats(statPointsOf(growth.level), "power");
    const power = towerPower({ stage: growth.stage, level: growth.level, tendency: "power", towerType: "splash" });
    const region = settle(newRegionWaves(0n, power), B(24 * 60) * WAVE_MS);
    expect(region.breaches > 100n).toBe(true);
    expect(growth).toEqual(before);
    expect(splitStats(statPointsOf(growth.level), "power")).toEqual(stats);
  });

  it("the wallet goes down only by the cost of automatic upgrades", () => {
    const rng = createRng(20);
    let g = NEW_GROWTH;
    for (let i = 0; i < 5000; i++) {
      const points = B(rng.int(0, 400));
      const next = addPoints(g, points);
      let spent = 0n;
      for (let s = g.stage; s < next.stage; s++) spent += upgradeCost(s);
      expect(next.wallet).toBe(g.wallet + points - spent);
      expect(next.wallet < upgradeCost(next.stage)).toBe(true);
      expect(next.total).toBe(g.total + points);
      expect(next.level >= g.level && next.stage >= g.stage).toBe(true);
      g = next;
    }
  });
});

describe("pace bot (D49)", () => {
  const rows50 = runPaceBot(PACE_BOT_50);
  const rows300 = runPaceBot(PACE_BOT_300);

  it("50 a day: 3 upgrades, 2 level-ups and 1 new look within the first 30 answers", () => {
    const first = rows50.find((r) => r.days === null)!;
    expect(first.answers).toBe(PACE_FIRST_ANSWERS.answers);
    expect(first.upgrades).toBeGreaterThanOrEqual(PACE_FIRST_ANSWERS.upgrades);
    expect(first.levelUps).toBeGreaterThanOrEqual(PACE_FIRST_ANSWERS.levelUps);
    expect(first.newLooks).toBeGreaterThanOrEqual(PACE_FIRST_ANSWERS.newLooks);
  });

  it("50 a day: stage 8~12 on day 1, 20~30 on day 7, 40~60 on day 30, 140~200 on day 365", () => {
    for (const [day, [min, max]] of Object.entries(PACE_STAGE_TARGETS)) {
      const row = rows50.find((r) => r.days === Number(day))!;
      expect(row.growth.stage, `day ${day}`).toBeGreaterThanOrEqual(B(min));
      expect(row.growth.stage, `day ${day}`).toBeLessThanOrEqual(B(max));
    }
  });

  it("300 a day at level 3 stays at or below stage 400 on day 365", () => {
    expect(rows300.find((r) => r.days === 365)!.growth.stage).toBeLessThanOrEqual(B(PACE_300_MAX_STAGE_365));
  });

  it("paceTarget (the /dev/sim verdict) agrees: 6 rows checked, all within target", () => {
    const verdicts = [...rows50.map((r) => paceTarget(PACE_BOT_50, r)), ...rows300.map((r) => paceTarget(PACE_BOT_300, r))].filter(
      (v) => v !== null,
    );
    expect(verdicts.map((v) => v.target)).toEqual([
      "업그레이드 3·레벨업 2·새 겉모습 1번 이상",
      "8~12단계",
      "20~30단계",
      "40~60단계",
      "140~200단계",
      "400단계 이하",
    ]);
    expect(verdicts.every((v) => v.ok)).toBe(true);
    const tooFast = { ...rows50.find((r) => r.days === 1)!, growth: { ...NEW_GROWTH, stage: 13n } };
    expect(paceTarget(PACE_BOT_50, tooFast)!.ok).toBe(false);
  });

  it("runs a year of the 300-a-day bot quickly enough for /dev/sim", () => {
    const t0 = performance.now();
    runPaceBot(PACE_BOT_300);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("integers only (code check)", () => {
  it("progress.ts uses numbers only for table positions", () => {
    const file = expect.getState().testPath!.replace(/progress\.test\.ts$/, "progress.ts");
    const tables = ["levelPointsAt", "upgradeCostAt", "basePowerAt"];
    const found = findFloatUse(file, { indexFunctions: new Set([...tables, "levelOf"]), numberInto: new Set(tables) });
    expect(found).toEqual([]);
  });
});
