import { describe, expect, it, vi } from "vitest";
import { createRng, type Rng } from "../math/random.ts";
import { findFloatUse } from "./integer-check.ts";
import {
  H0,
  WAVE_MS,
  WAVE_SECONDS,
  blocksWave,
  changePower,
  maxBlockableWave,
  newRegionWaves,
  replayLazy,
  replayStepwise,
  settle,
  waveAfter,
  waveHealth,
  type PowerChange,
  type RegionWaves,
} from "./waves.ts";

const B = BigInt;
const DAY_MS = B(24 * 60) * WAVE_MS;

/** Smallest power that blocks wave w. */
const powerFor = (w: bigint): bigint => (waveHealth(w) + WAVE_SECONDS - B(1)) / WAVE_SECONDS;

describe("H(w): enemy health sum", () => {
  it("starts at H0 and grows by ×108/100 rounded up", () => {
    expect(waveHealth(B(1))).toBe(H0);
    let h = H0;
    for (let w = 2; w <= 2000; w++) {
      const prev = h;
      h = (prev * B(108) + B(99)) / B(100);
      expect(waveHealth(B(w))).toBe(h);
      expect(h > prev).toBe(true);
    }
  });

  it("rejects waves below 1", () => {
    expect(() => waveHealth(B(0))).toThrow(RangeError);
  });
});

describe("blocking and breaching (D17)", () => {
  it("blocks when P × 60 = H(w) and breaches when P × 60 = H(w) − 1", () => {
    let exact = 0n;
    let oneShort = 0n;
    for (let w = B(1); exact === 0n || oneShort === 0n; w++) {
      if (exact === 0n && waveHealth(w) % WAVE_SECONDS === 0n) exact = w;
      if (oneShort === 0n && (waveHealth(w) - 1n) % WAVE_SECONDS === 0n) oneShort = w;
    }
    expect(blocksWave(waveHealth(exact) / WAVE_SECONDS, exact)).toBe(true);
    expect(blocksWave((waveHealth(oneShort) - 1n) / WAVE_SECONDS, oneShort)).toBe(false);
  });

  it("blocks with the smallest enough power and breaches with one less, waves 1~300", () => {
    for (let w = 1n; w <= 300n; w++) {
      expect(blocksWave(powerFor(w), w)).toBe(true);
      expect(blocksWave(powerFor(w) - 1n, w)).toBe(false);
    }
  });

  it("goes to w + 1 when blocked and max(1, w − 5) when breached", () => {
    expect(waveAfter(7n, true)).toBe(8n);
    for (const w of [1n, 2n, 3n, 4n, 5n, 6n]) expect(waveAfter(w, false)).toBe(1n);
    expect(waveAfter(7n, false)).toBe(2n);
    expect(waveAfter(123n, false)).toBe(118n);
  });

  it("breaches at waves 1~5 drop to wave 1 in a settle", () => {
    for (let w = 1n; w <= 5n; w++) {
      const s = { ...newRegionWaves(0n, 0n), wave: w };
      const after = settle(s, WAVE_MS);
      expect(after).toMatchObject({ wave: 1n, best: 0n, breaches: 1n });
    }
  });

  it("W is the highest blocked wave, 0 when nothing is blocked", () => {
    expect(maxBlockableWave(0n)).toBe(0n);
    expect(maxBlockableWave(H0 / WAVE_SECONDS - 1n)).toBe(0n);
    for (let w = 1n; w <= 500n; w += 7n) {
      expect(maxBlockableWave(powerFor(w))).toBe(w);
      expect(maxBlockableWave(powerFor(w + 1n) - 1n)).toBe(w);
    }
  });

  it("a region with no guardians stays at wave 1 and breaches every wave", () => {
    const after = settle(newRegionWaves(0n), 30n * DAY_MS);
    expect(after).toMatchObject({ wave: 1n, best: 0n, breaches: 30n * 1440n });
  });

  it("the best wave is the highest blocked wave and never goes down", () => {
    const start = newRegionWaves(0n, powerFor(40n));
    const changes = [
      { atMs: 100n * WAVE_MS, power: powerFor(12n) },
      { atMs: 200n * WAVE_MS, power: 0n },
    ];
    let highest = 0n;
    let previous = start;
    let k = 0n;
    replayStepwise(start, changes, 300n * WAVE_MS, (step) => {
      if (step.blocked && step.wave > highest) highest = step.wave;
      k += 1n;
      const now = replayLazy(start, changes.filter((c) => c.atMs < k * WAVE_MS), k * WAVE_MS);
      expect(now.best).toBe(highest);
      expect(now.best >= previous.best).toBe(true);
      previous = now;
    });
    const end = replayLazy(start, changes, 300n * WAVE_MS);
    expect(highest).toBe(40n);
    expect(end.best).toBe(40n);
    expect(end.wave).toBe(1n);
  });

  it("with the same power the region cycles W − 4 … W + 1", () => {
    const seen: bigint[] = [];
    replayStepwise(newRegionWaves(0n, powerFor(20n)), [], 40n * WAVE_MS, (step) => seen.push(step.wave));
    expect(seen.slice(19, 33)).toEqual([20n, 21n, 16n, 17n, 18n, 19n, 20n, 21n, 16n, 17n, 18n, 19n, 20n, 21n]);
    const small: bigint[] = [];
    replayStepwise(newRegionWaves(0n, powerFor(3n)), [], 10n * WAVE_MS, (step) => small.push(step.wave));
    expect(small).toEqual([1n, 2n, 3n, 4n, 1n, 2n, 3n, 4n, 1n, 2n]);
  });
});

describe("power changes apply from the next wave (D19)", () => {
  it("a change in the middle of a wave does not change that wave's result", () => {
    const start = newRegionWaves(0n, powerFor(1n));
    const dropped = changePower(start, 30_000n, 0n);
    const afterFirst = settle(dropped, WAVE_MS);
    expect(afterFirst).toMatchObject({ wave: 2n, best: 1n, breaches: 0n, power: 0n });
    expect(settle(dropped, 2n * WAVE_MS)).toMatchObject({ wave: 1n, best: 1n, breaches: 1n });
  });

  it("a change exactly at a wave start waits for the following wave", () => {
    const start = newRegionWaves(0n, powerFor(10n));
    const s = changePower(start, WAVE_MS, 0n); // wave 2 starts at WAVE_MS with the old power
    expect(settle(s, 2n * WAVE_MS)).toMatchObject({ wave: 3n, best: 2n, breaches: 0n });
    expect(settle(s, 3n * WAVE_MS)).toMatchObject({ wave: 1n, breaches: 1n });
  });

  it("only the last change before a wave starts counts", () => {
    const start = newRegionWaves(0n, powerFor(10n));
    const s = changePower(changePower(start, 10_000n, 0n), 20_000n, powerFor(10n));
    expect(settle(s, 5n * WAVE_MS)).toMatchObject({ wave: 6n, best: 5n, breaches: 0n });
  });

  it("the same start and the same changes give the same result", () => {
    const rng = createRng(19);
    for (let i = 0; i < 50; i++) {
      const { start, changes, untilMs } = randomCase(rng);
      expect(replayLazy(start, changes, untilMs)).toEqual(replayLazy({ ...start }, [...changes], untilMs));
      expect(replayStepwise(start, changes, untilMs)).toEqual(replayStepwise(start, changes, untilMs));
    }
  });
});

const bigInt = (rng: Rng, digits: number): bigint => {
  let s = String(rng.int(1, 9));
  for (let i = 1; i < digits; i++) s += String(rng.int(0, 9));
  return B(s);
};

function randomPower(rng: Rng): bigint {
  const kind = rng.int(0, 9);
  if (kind === 0) return 0n;
  if (kind <= 2) return B(rng.int(0, 200));
  if (kind <= 6) return powerFor(B(rng.int(1, 400))) + B(rng.int(-1, 1));
  return bigInt(rng, rng.int(1, 60));
}

type Case = { start: RegionWaves; changes: PowerChange[]; untilMs: bigint };

/** Up to 30 days, up to 60 changes; some on wave boundaries, some at the same time, some around and after the end. */
function randomCase(rng: Rng): Case {
  const startMs = B(rng.int(0, 1_000_000_000));
  const wave = B(rng.int(1, 300));
  const start: RegionWaves = {
    wave,
    waveStartMs: startMs,
    power: randomPower(rng),
    nextPower: randomPower(rng),
    best: B(rng.int(0, 300)),
    breaches: B(rng.int(0, 10)),
  };
  const spanMs = B(rng.int(0, 30 * 24 * 60)) * WAVE_MS + B(rng.int(0, 59_999));
  const untilMs = startMs + spanMs;
  const changes: PowerChange[] = [];
  const count = rng.int(0, 60);
  for (let i = 0; i < count; i++) {
    const r = rng.int(0, 9);
    let atMs: bigint;
    if (r < 3) atMs = startMs + (spanMs / WAVE_MS === 0n ? 0n : B(rng.int(0, Number(spanMs / WAVE_MS))) * WAVE_MS);
    else if (r < 4 && changes.length > 0) atMs = changes[changes.length - 1]!.atMs;
    else if (r === 8) atMs = untilMs + B(rng.int(-1, 1));
    else if (r === 9) atMs = untilMs + B(rng.int(1, 2 * 24 * 60 * 60_000));
    else atMs = startMs + (B(rng.int(0, 1_000_000)) * spanMs) / 1_000_000n;
    changes.push({ atMs, power: randomPower(rng) });
  }
  changes.sort((a, b) => (a.atMs < b.atMs ? -1 : a.atMs > b.atMs ? 1 : 0));
  return { start, changes, untilMs };
}

/** Lazy settling as the server does it, with extra settle-only queries between changes. */
function replayWithQueries(rng: Rng, { start, changes, untilMs }: Case): RegionWaves {
  let s = start;
  let last = start.waveStartMs;
  for (const c of changes) {
    if (c.atMs > untilMs) break; // not happened yet when the server settles to untilMs
    if (rng.int(0, 2) === 0) s = settle(s, last + ((c.atMs - last) * B(rng.int(0, 100))) / 100n);
    s = changePower(s, c.atMs, c.power);
    last = c.atMs;
  }
  return settle(s, untilMs);
}

describe("changes around the end time (D18)", () => {
  const start = newRegionWaves(0n, 10n);
  it.each([
    ["one wave later than the end", 60_000n, 30_000n],
    ["just after the end", 30_001n, 30_000n],
    ["exactly at the end", 30_000n, 30_000n],
    ["just before the end", 29_999n, 30_000n],
    ["on a wave boundary that is the end", 120_000n, 120_000n],
    ["one ms after a boundary end", 120_001n, 120_000n],
    ["one ms before a boundary end", 119_999n, 120_000n],
  ])("%s", (_name, atMs, untilMs) => {
    const changes = [{ atMs, power: 0n }];
    expect(replayLazy(start, changes, untilMs)).toEqual(replayStepwise(start, changes, untilMs));
  });

  it("ignores changes after the end (codex repro)", () => {
    const end = replayLazy(start, [{ atMs: 60_000n, power: 0n }], 30_000n);
    expect(end).toEqual(start);
  });
});

describe("lazy settling = one wave at a time (D18)", () => {
  it("1,000 random power histories (up to 30 days) agree on every field", () => {
    const rng = createRng(18);
    let waves = 0;
    let breached = 0;
    for (let i = 0; i < 1000; i++) {
      const c = randomCase(rng);
      const want = replayStepwise(c.start, c.changes, c.untilMs, (step) => {
        waves++;
        if (!step.blocked) breached++;
      });
      expect(replayLazy(c.start, c.changes, c.untilMs), `case ${i}`).toEqual(want);
      expect(replayWithQueries(rng, c), `case ${i} with queries`).toEqual(want);
    }
    console.info(`D18: ${waves} waves, ${breached} breaches`);
    // The histories really cover weeks of waves with both outcomes.
    expect(waves).toBeGreaterThan(10_000_000);
    expect(breached).toBeGreaterThan(waves / 10);
    expect(breached).toBeLessThan(waves);
  }, 120_000);

});

// Timing is kept apart from the correctness checks. CI asserts the median of warm runs against the D18 limits
// and cold runs (fresh health table) against twice the limits so a slow or busy machine does not flake.
describe("settling time (D18)", () => {
  const LIMITS: [string, bigint, number][] = [
    ["30d", 30n * DAY_MS, 5],
    ["365d", 365n * DAY_MS, 20],
  ];
  const STATES: [string, () => RegionWaves][] = [
    ["W=300", () => newRegionWaves(0n, powerFor(300n))],
    ["W=300 from wave 5000", () => ({ ...newRegionWaves(0n, powerFor(300n)), wave: 5000n })],
    ["300-digit power", () => newRegionWaves(0n, bigInt(createRng(1), 300))],
    ["no guardians", () => newRegionWaves(0n, 0n)],
  ];

  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]!;

  it.each(STATES)("%s: warm median within 5ms (30d) and 20ms (365d)", (name, make) => {
    const state = make();
    for (const [label, nowMs, limit] of LIMITS) {
      settle(state, nowMs);
      const times = Array.from({ length: 51 }, () => {
        const t0 = performance.now();
        settle(state, nowMs);
        return performance.now() - t0;
      });
      console.info(`warm ${name} ${label}: median ${median(times).toFixed(3)}ms, max ${Math.max(...times).toFixed(3)}ms`);
      expect(median(times)).toBeLessThanOrEqual(limit);
    }
  });

  it.each(STATES)("%s: cold (fresh health table) within twice the limits", async (name, make) => {
    for (const [label, nowMs, limit] of LIMITS) {
      vi.resetModules();
      const fresh = await import("./waves.ts");
      const state = make();
      const t0 = performance.now();
      fresh.settle(state, nowMs);
      const ms = performance.now() - t0;
      console.info(`cold ${name} ${label}: ${ms.toFixed(3)}ms`);
      expect(ms).toBeLessThanOrEqual(limit * 2);
    }
  });
});

describe("integers only (D17 code check)", () => {
  it("rejects waves past the safe integer range instead of losing precision", () => {
    expect(() => waveHealth(2n ** 53n + 1n)).toThrow(RangeError);
  });

  it("waves.ts uses numbers only for health table positions", () => {
    const file = expect.getState().testPath!.replace(/waves\.test\.ts$/, "waves.ts");
    const found = findFloatUse(file, {
      indexFunctions: new Set(["healthAt", "maxBlockableWave"]),
      // BigInt -> number only as a table position: straight into healthAt.
      numberInto: new Set(["healthAt"]),
    });
    expect(found).toEqual([]);
  });
});
