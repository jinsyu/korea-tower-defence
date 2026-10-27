// Child growth (spec "문제 흐름과 포인트", "자동 성장", D20, D45~D47).
// Integers only (BigInt), the same rule as waves.ts: tower power grows 5% a stage and passes 2^53.
// BigInt() calls instead of 10n literals: the web app compiles for ES2017.
import type { MathLevel } from "../math/levels.ts";
import type { TowerType } from "../looks.ts";

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);

/** Points for a correct answer at each problem level, the same for every grade band (Q27). */
export const ANSWER_POINTS: Readonly<Record<MathLevel, bigint>> = { 1: BigInt(10), 2: BigInt(12), 3: BigInt(15) };
/** Daily cut-down (Korean day): correct answers up to 150 at 100%, up to 300 at 50%, then 10%. */
export const FULL_POINTS_UNTIL = BigInt(150);
export const HALF_POINTS_UNTIL = BigInt(300);

/** Percent of the points paid for the nth correct answer of the day (n starts at 1). */
export function dailyRatePercent(nthToday: bigint): bigint {
  if (nthToday <= FULL_POINTS_UNTIL) return HUNDRED;
  if (nthToday <= HALF_POINTS_UNTIL) return BigInt(50);
  return BigInt(10);
}

/** Points for the nth correct answer of the day, rounded down. */
export function answerPoints(level: MathLevel, nthToday: bigint): bigint {
  return (ANSWER_POINTS[level] * dailyRatePercent(nthToday)) / HUNDRED;
}

/** Smallest c ≥ 0 with c^n ≥ x: an exact ceil(x^(1/n)) for x ≥ 0. */
function rootCeil(x: bigint, n: bigint): bigint {
  if (x <= ZERO) return ZERO;
  let hi = ONE;
  while (hi ** n < x) hi *= TWO;
  let lo = ZERO; // lo^n < x ≤ hi^n
  while (hi - lo > ONE) {
    const mid = (lo + hi) / TWO;
    if (mid ** n >= x) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** Tower stage 1's base power B(1), per second. A new guardian alone exactly blocks wave 1 (B(1) × 60 = H0). */
export const BASE_POWER_1 = BigInt(10);

// Tables grown on demand and shared, like the health table in waves.ts.
// table[i] holds the value for level / stage i + 1. Only the *At functions do number arithmetic: table positions.
const levelPoints: bigint[] = [ZERO];
const upgradeCosts: bigint[] = [];
const basePowers: bigint[] = [BASE_POWER_1];
const MAX_INDEX = BigInt(Number.MAX_SAFE_INTEGER);

// Level n (n ≥ 2) needs ceil(50 × n^1.6) total points = smallest c with c^5 ≥ 50^5 × n^8.
function levelPointsAt(index: number): bigint {
  while (levelPoints.length <= index) {
    const n = BigInt(levelPoints.length + 1);
    levelPoints.push(rootCeil(BigInt(50) ** BigInt(5) * n ** BigInt(8), BigInt(5)));
  }
  return levelPoints[index]!;
}

// Stage s -> s + 1 costs ceil(10 × s^1.1) = smallest c with c^10 ≥ 10^10 × s^11.
function upgradeCostAt(index: number): bigint {
  while (upgradeCosts.length <= index) {
    const s = BigInt(upgradeCosts.length + 1);
    upgradeCosts.push(rootCeil(BigInt(10) ** BigInt(10) * s ** BigInt(11), BigInt(10)));
  }
  return upgradeCosts[index]!;
}

// B(s + 1) = ceil(B(s) × 105 / 100).
function basePowerAt(index: number): bigint {
  while (basePowers.length <= index) {
    basePowers.push((basePowers[basePowers.length - 1]! * BigInt(105) + BigInt(99)) / HUNDRED);
  }
  return basePowers[index]!;
}

function checkPosition(value: bigint, what: string): void {
  if (value < ONE || value - ONE > MAX_INDEX) throw new RangeError(`${what} out of range: ${value}`);
}

/** Total points needed to reach level n. Level 1 is 0. */
export function levelThreshold(level: bigint): bigint {
  checkPosition(level, "level");
  return levelPointsAt(Number(level - ONE));
}

/** Points the wallet needs to go from stage s to s + 1. */
export function upgradeCost(stage: bigint): bigint {
  checkPosition(stage, "stage");
  return upgradeCostAt(Number(stage - ONE));
}

/** Tower base power B(s) per second. */
export function basePower(stage: bigint): bigint {
  checkPosition(stage, "stage");
  return basePowerAt(Number(stage - ONE));
}

/** The level a total of points reaches (the table is strictly increasing, D45). */
export function levelOf(total: bigint): bigint {
  // Grow the table until it passes total, then search it: levelPoints[lo] <= total < levelPoints[hi].
  while (levelPoints[levelPoints.length - 1]! <= total) levelPointsAt(levelPoints.length);
  let lo = 0;
  let hi = levelPoints.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (levelPoints[mid]! <= total) lo = mid;
    else hi = mid;
  }
  return BigInt(lo + 1);
}

export type Growth = {
  /** Total points ever earned (experience). Never goes down. */
  total: bigint;
  /** Points not yet spent on upgrades. Goes down only by automatic upgrades. */
  wallet: bigint;
  level: bigint;
  /** Tower stage, from 1. */
  stage: bigint;
};

export const NEW_GROWTH: Growth = { total: ZERO, wallet: ZERO, level: ONE, stage: ONE };

/**
 * A correct answer's points go to both the total and the wallet. The level follows the total,
 * and the tower upgrades on its own while the wallet covers the next cost (several stages at once is fine).
 */
export function addPoints(growth: Growth, points: bigint): Growth {
  if (points < ZERO) throw new RangeError(`points must not be negative: ${points}`);
  const total = growth.total + points;
  let wallet = growth.wallet + points;
  let stage = growth.stage;
  for (let cost = upgradeCost(stage); wallet >= cost; cost = upgradeCost(stage)) {
    wallet -= cost;
    stage += ONE;
  }
  return { total, wallet, level: levelOf(total), stage };
}

export const STATS = ["power", "speed", "range", "luck"] as const;
export type Stat = (typeof STATS)[number];
export type Stats = Record<Stat, bigint>;
export const TENDENCIES = ["balanced", ...STATS] as const;
export type Tendency = (typeof TENDENCIES)[number];

/** One stat point per level-up. */
export const statPointsOf = (level: bigint): bigint => level - ONE;

/**
 * Split stat points by tendency. Balanced = the four stats in turn (power, speed, range, luck).
 * One stat = that stat 2 : the others 1 each, handed out as focus, focus, then the others in order.
 * Always a function of (points, tendency), so changing the tendency re-splits points already earned.
 */
export function splitStats(points: bigint, tendency: Tendency): Stats {
  if (tendency === "balanced") {
    const four = BigInt(STATS.length);
    const each = points / four;
    const extra = points % four;
    const stats = {} as Stats;
    STATS.forEach((stat, i) => (stats[stat] = each + (BigInt(i) < extra ? ONE : ZERO)));
    return stats;
  }
  const cycles = points / BigInt(5);
  const rest = points % BigInt(5);
  const stats = { [tendency]: TWO * cycles + (rest < TWO ? rest : TWO) } as Stats;
  STATS.filter((stat) => stat !== tendency).forEach((stat, i) => (stats[stat] = cycles + (rest > TWO + BigInt(i) ? ONE : ZERO)));
  return stats;
}

const statSum = (stats: Stats): bigint => STATS.reduce((sum, stat) => sum + stats[stat], ZERO);

export type Tower = { stage: bigint; level: bigint; tendency: Tendency; towerType: TowerType };

/**
 * Tower power p per second: B(s) × (100 + 2 × stat point sum) / 100, rounded down.
 * Only the stat sum counts, so tower type and tendency never change it (D47).
 */
export function towerPower(tower: Tower): bigint {
  const sum = statSum(splitStats(statPointsOf(tower.level), tower.tendency));
  return (basePower(tower.stage) * (HUNDRED + TWO * sum)) / HUNDRED;
}
