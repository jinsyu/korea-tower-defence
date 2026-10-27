// Region waves and lazy settling (spec "웨이브 계산", "24시간 진행: 게으른 계산", D17~D19).
// Integers only (BigInt): the numbers grow past 2^53 and floats would make results depend on the engine.
// BigInt() calls instead of 10n literals: the web app compiles for ES2017.

const ZERO = BigInt(0);
const ONE = BigInt(1);
const FIVE = BigInt(5);
const GROWTH_NUM = BigInt(108);
const GROWTH_DEN = BigInt(100);

/** Wave length T in seconds. One wave per minute, 1,440 a day. */
export const WAVE_SECONDS = BigInt(60);
export const WAVE_MS = WAVE_SECONDS * BigInt(1000);
/** Enemy health of wave 1, H(1). A new guardian alone exactly blocks it (B(1) × 60 = H0, spec "진행 속도 봇 결과"). */
export const H0 = BigInt(600);
/** A breach sends the region this many waves back (Q26). */
export const BREACH_STEP = FIVE;

export type RegionWaves = {
  /** The wave in progress. Starts at 1. */
  wave: bigint;
  /** Server time (ms) the wave in progress started. */
  waveStartMs: bigint;
  /** Firepower P of the wave in progress (fixed when it started). */
  power: bigint;
  /** Firepower for the waves after the one in progress. */
  nextPower: bigint;
  /** Highest wave ever blocked, 0 if none. Never goes down. */
  best: bigint;
  /** Breaches counted so far. */
  breaches: bigint;
};

export type PowerChange = { atMs: bigint; power: bigint };

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - ONE) / b;
const maxBig = (a: bigint, b: bigint): bigint => (a > b ? a : b);

// healths[i] = H(i + 1). Grows on demand and is shared by every region.
// healthAt and maxBlockableWave are the only places with number arithmetic: table positions, never game values.
const healths: bigint[] = [H0];
const MAX_INDEX = BigInt(Number.MAX_SAFE_INTEGER);

function healthAt(index: number): bigint {
  while (healths.length <= index) {
    healths.push(ceilDiv(healths[healths.length - 1]! * GROWTH_NUM, GROWTH_DEN));
  }
  return healths[index]!;
}

/** Enemy health sum H(w): H(1) = H0, H(w + 1) = ceil(H(w) × 108 / 100). */
export function waveHealth(wave: bigint): bigint {
  if (wave < ONE || wave - ONE > MAX_INDEX) throw new RangeError(`wave out of range: ${wave}`);
  return healthAt(Number(wave - ONE));
}

/** P × T ≥ H(w) blocks wave w. */
export function blocksWave(power: bigint, wave: bigint): boolean {
  return power * WAVE_SECONDS >= waveHealth(wave);
}

/** Wave after w: w + 1 when blocked, max(1, w − 5) when breached. */
export function waveAfter(wave: bigint, blocked: boolean): bigint {
  return blocked ? wave + ONE : maxBig(ONE, wave - BREACH_STEP);
}

/** W = the highest wave power P blocks, 0 if it blocks none. H is strictly increasing, so every w ≤ W is blocked. */
export function maxBlockableWave(power: bigint): bigint {
  const cap = power * WAVE_SECONDS;
  if (cap < H0) return ZERO;
  // Grow the table only until it passes cap (W + 1 entries), then search it.
  while (healths[healths.length - 1]! <= cap) healthAt(healths.length);
  let lo = 0; // healths[lo] <= cap < healths[hi]
  let hi = healths.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (healths[mid]! <= cap) lo = mid;
    else hi = mid;
  }
  return BigInt(lo + 1);
}

type Run = { wave: bigint; best: bigint; breaches: bigint };

/**
 * n waves in a row with the same power, in O(1) once W is known.
 * Above W the region drops 5 per wave; from at most W it climbs to W + 1, breaches,
 * and then repeats W − 4 … W + 1 (6 waves; W + 1 waves when W < 5).
 */
function runSamePower(start: Run, power: bigint, count: bigint): Run {
  let { wave, best, breaches } = start;
  let n = count;
  if (n <= ZERO) return start;
  const top = maxBlockableWave(power);

  if (wave > top) {
    const drops = top === ZERO ? n : ceilDiv(wave - top, FIVE);
    if (drops >= n) return { wave: maxBig(ONE, wave - BREACH_STEP * n), best, breaches: breaches + n };
    wave = maxBig(ONE, wave - BREACH_STEP * drops);
    breaches += drops;
    n -= drops;
  }

  const climb = top - wave + ONE;
  if (n <= climb) return { wave: wave + n, best: maxBig(best, wave + n - ONE), breaches };
  best = maxBig(best, top);
  n -= climb;

  const restart = maxBig(ONE, top + ONE - BREACH_STEP);
  const cycle = top - restart + BigInt(2);
  breaches += n / cycle;
  n %= cycle;
  if (n === ZERO) return { wave: top + ONE, best, breaches };
  return { wave: restart + n - ONE, best, breaches: breaches + ONE };
}

/** A region that has not fought yet: wave 1 starting now. */
export function newRegionWaves(startMs: bigint, power: bigint = ZERO): RegionWaves {
  return { wave: ONE, waveStartMs: startMs, power, nextPower: power, best: ZERO, breaches: ZERO };
}

/** Resolve every wave that ended by nowMs (lazy settling). The first uses `power`, the rest `nextPower`. */
export function settle(state: RegionWaves, nowMs: bigint): RegionWaves {
  if (nowMs < state.waveStartMs + WAVE_MS) return state;
  const count = (nowMs - state.waveStartMs) / WAVE_MS;
  const first = runSamePower(state, state.power, ONE);
  const rest = runSamePower(first, state.nextPower, count - ONE);
  return {
    ...rest,
    waveStartMs: state.waveStartMs + count * WAVE_MS,
    power: state.nextPower,
    nextPower: state.nextPower,
  };
}

/** Settle up to atMs, then use the new power from the next wave on (the wave in progress keeps its power). */
export function changePower(state: RegionWaves, atMs: bigint, power: bigint): RegionWaves {
  return { ...settle(state, atMs), nextPower: power };
}

/** Apply power changes (sorted by time) made up to untilMs and settle to untilMs, the way the server does. Later changes are left out. */
export function replayLazy(state: RegionWaves, changes: readonly PowerChange[], untilMs: bigint): RegionWaves {
  let s = state;
  for (const c of changes) {
    if (c.atMs > untilMs) break;
    s = changePower(s, c.atMs, c.power);
  }
  return settle(s, untilMs);
}

export type WaveStep = { wave: bigint; startMs: bigint; power: bigint; health: bigint; blocked: boolean };

/**
 * Checker: one wave at a time, straight from the rules. Wave k starting at s uses the power of
 * the last change made before s (or the state's own power for the wave already in progress).
 * `onWave` sees every resolved wave (for /dev/sim tables).
 */
export function replayStepwise(
  state: RegionWaves,
  changes: readonly PowerChange[],
  untilMs: bigint,
  onWave?: (step: WaveStep) => void,
): RegionWaves {
  let { wave, best, breaches, waveStartMs: start, power } = state;
  let next = state.nextPower;
  const pending = [...changes];
  const takeChangesBefore = (endMs: bigint, inclusive: boolean) => {
    while (pending[0] && (pending[0].atMs < endMs || (inclusive && pending[0].atMs === endMs))) next = pending.shift()!.power;
  };
  while (start + WAVE_MS <= untilMs) {
    const blocked = blocksWave(power, wave);
    onWave?.({ wave, startMs: start, power, health: waveHealth(wave), blocked });
    if (blocked) best = maxBig(best, wave);
    else breaches += ONE;
    wave = waveAfter(wave, blocked);
    start += WAVE_MS;
    takeChangesBefore(start, false);
    power = next;
  }
  takeChangesBefore(untilMs, true);
  return { wave, waveStartMs: start, power, nextPower: next, best, breaches };
}
