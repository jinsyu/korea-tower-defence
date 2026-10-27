// Simplified game rules for the load PoC only. The real rules (BigInt, lazy cycle formula)
// live in packages/core later (T9, T10). Numbers here only need to cost about the same.

export const PORT = Number(process.env.PORT ?? 4100);
export const REGION_COUNT = 185;
export const GUARDIAN_COUNT = 50_000;
export const BIG_REGION_SIZE = 2_000;
export const POINTS_PER_CORRECT = 10;
export const WAVE_MS = 60_000;
export const POWER_APPLY_MS = 10_000;
export const BROADCAST_MS = 1_000;
export const RECENT_LIMIT = 50;
export const REP_COUNT = 8;
const H0 = 1_000;

export const regionCode = (i: number) => `R${String(i).padStart(3, "0")}`;
export const guardianId = (i: number) => `g${String(i).padStart(6, "0")}`;
export const guardianKey = (id: string) => `key-${id}`;

export function levelFor(points: number, level = 1): number {
  while (points >= Math.ceil(50 * level ** 1.6)) level++;
  return level;
}

export function upgrade(stage: number, wallet: number): { stage: number; wallet: number } {
  let cost = Math.ceil(10 * stage ** 1.1);
  while (wallet >= cost) {
    wallet -= cost;
    stage++;
    cost = Math.ceil(10 * stage ** 1.1);
  }
  return { stage, wallet };
}

export function powerOf(level: number, stage: number): number {
  return Math.floor(100 * 1.05 ** (stage - 1)) + (level - 1) * 10;
}

const hpTable: number[] = [0, H0];
export function enemyHp(wave: number): number {
  while (hpTable.length <= wave) hpTable.push(Math.ceil(hpTable[hpTable.length - 1] * 1.08));
  return hpTable[wave];
}

export interface RegionState {
  code: string;
  wave: number;
  waveStartedAt: number;
  power: number;
  nextPower: number;
  bestWave: number;
  bestWaveAt: number;
  guardianCount: number;
  todayCorrect: number;
  todayBreaches: number;
}

/** Settle every wave that ended before `now`. Returns true if anything changed. */
export function settle(r: RegionState, now: number): boolean {
  let changed = false;
  while (now >= r.waveStartedAt + WAVE_MS) {
    if (r.power * (WAVE_MS / 1000) >= enemyHp(r.wave)) {
      if (r.wave > r.bestWave) {
        r.bestWave = r.wave;
        r.bestWaveAt = r.waveStartedAt + WAVE_MS;
      }
      r.wave++;
    } else {
      r.wave = Math.max(1, r.wave - 5);
      r.todayBreaches++;
    }
    r.waveStartedAt += WAVE_MS;
    r.power = r.nextPower;
    changed = true;
  }
  return changed;
}
