import { describe, expect, it } from "vitest";
import { fakeRegionStats } from "@/lib/fake-region-stats";

const codes = Array.from({ length: 185 }, (_, i) => `${11 + (i % 28)}${String(i).padStart(3, "0")}`);
const sidoOf = (code: string) => code.slice(0, 2);

describe("fakeRegionStats", () => {
  const stats = fakeRegionStats(codes, sidoOf);

  it("is deterministic for the same codes", () => {
    expect(fakeRegionStats(codes, sidoOf)).toEqual(stats);
  });

  it("gives every region a guardian count and a best wave, 0 guardians meaning no best wave", () => {
    expect(stats.size).toBe(185);
    for (const s of stats.values()) {
      expect(s.guardians).toBeGreaterThanOrEqual(0);
      if (s.guardians === 0) {
        expect(s.best).toBe(0);
        expect(s.band).toBe(-1);
      } else {
        expect(s.best).toBeGreaterThan(0);
        expect(s.band).toBeGreaterThanOrEqual(0);
        expect(s.band).toBeLessThanOrEqual(4);
      }
    }
  });

  it("spreads guarded regions over all five best-wave bands", () => {
    const bands = new Set([...stats.values()].map((s) => s.band).filter((b) => b >= 0));
    expect([...bands].sort()).toEqual([0, 1, 2, 3, 4]);
  });
});
