import { describe, expect, it } from "vitest";
import { waveHealth } from "@ktd/core";
import { MAX_POINTS, powerOf, simulate } from "./wave-sim";

describe("/dev/sim data", () => {
  it("builds the power from mantissa × 10^exponent", () => {
    expect(powerOf(8, 12)).toBe(BigInt("8000000000000"));
    expect(powerOf(0, 30)).toBe(BigInt(0));
    expect(powerOf(1, 0)).toBe(BigInt(1));
  });

  it("climbs to W, then cycles W − 4 … W + 1", () => {
    const power = (waveHealth(BigInt(20)) + BigInt(59)) / BigInt(60);
    const r = simulate(power, 1, BigInt(1));
    expect(r.top).toBe(BigInt(20));
    expect(r.firstWaves).toHaveLength(60);
    expect(r.firstWaves.slice(19, 22).map((s) => [s.wave, s.blocked])).toEqual([
      [BigInt(20), true],
      [BigInt(21), false],
      [BigInt(16), true],
    ]);
    expect(r.end.best).toBe(BigInt(20));
  });

  it("keeps the graph to a few hundred points even for a year", () => {
    const r = simulate(BigInt(1_000_000), 365, BigInt(1));
    expect(r.points.length).toBeLessThanOrEqual(MAX_POINTS + 1);
    expect(r.points.at(-1)!.minute).toBe(365 * 1440);
  });
});
