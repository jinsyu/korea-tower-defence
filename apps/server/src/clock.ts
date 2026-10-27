// The server clock. Production runs on the wall clock; E2E runs a faster clock so 100 waves pass in minutes (D23).

export type Clock = {
  /** Server time, epoch ms. */
  now: () => number;
  /** Server ms per real ms. Timers wait (server ms) / rate real ms. */
  rate: number;
};

export const wallClock: Clock = { now: Date.now, rate: 1 };

/** A clock running `rate` times faster than the wall clock from `fromMs`. Restarts keep the same server time. */
export function fastClock(rate: number, fromMs: number): Clock {
  return { now: () => Math.floor(fromMs + (Date.now() - fromMs) * rate), rate };
}

/**
 * TEST_CLOCK_RATE (and TEST_CLOCK_FROM_MS, so a restarted process goes on from the same server time) turn on the
 * fast clock for E2E. Refused in production.
 */
export function clockFromEnv(env: NodeJS.ProcessEnv = process.env): Clock {
  const rate = Number(env.TEST_CLOCK_RATE ?? "");
  if (!env.TEST_CLOCK_RATE) return wallClock;
  if (env.NODE_ENV === "production") throw new Error("TEST_CLOCK_RATE is for tests only");
  if (!Number.isInteger(rate) || rate < 1 || rate > 600) throw new Error("TEST_CLOCK_RATE must be a whole number from 1 to 600");
  const from = Number(env.TEST_CLOCK_FROM_MS || Date.now());
  if (!Number.isFinite(from)) throw new Error("TEST_CLOCK_FROM_MS must be epoch ms");
  return fastClock(rate, from);
}
