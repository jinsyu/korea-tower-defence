import { describe, expect, it } from "vitest";
import { EVO_AT, MAT_AT, TIER_AT, TOWER_TYPES, lookKey, lookOf, nextLook, sizeOf } from "./looks";

describe("lookOf thresholds (D50)", () => {
  const cases = [
    ["evo", EVO_AT],
    ["mat", MAT_AT],
    ["tier", TIER_AT],
  ] as const;
  for (const [layer, at] of cases) {
    it(`${layer} changes exactly at ${at.join(", ")}`, () => {
      at.forEach((t, i) => {
        expect(lookOf(t)[layer]).toBe(i);
        if (i > 0) expect(lookOf(t - 1)[layer]).toBe(i - 1);
      });
      // Between thresholds the layer stays put.
      for (let s = 1; s < 1200; s++) {
        if (!(at as readonly number[]).includes(s)) expect(lookOf(s)[layer]).toBe(lookOf(s - 1 || 1)[layer]);
      }
    });
  }

  it("24 -> 25 becomes evolution II and iron", () => {
    expect(lookOf(24)).toMatchObject({ evo: 0, mat: 1 });
    expect(lookOf(25)).toMatchObject({ evo: 1, mat: 2 });
  });

  it("49 -> 50 becomes bronze with a green rim", () => {
    expect(lookOf(49)).toMatchObject({ mat: 2, tier: 0 });
    expect(lookOf(50)).toMatchObject({ mat: 3, tier: 1 });
  });

  it("no ornament before step 5", () => {
    for (let s = 1; s < 5; s++) expect(lookOf(s).orn).toBe(-1);
    expect(lookOf(5).orn).toBe(1);
  });
});

describe("5-step bundles (D50)", () => {
  const combo = (s: number) => {
    const L = lookOf(s);
    return [L.evo, L.mat, L.tier, L.body, L.bar, L.orn].join(".");
  };

  it("steps inside one bundle share a look", () => {
    for (let k = 0; k < 100; k++) {
      const first = Math.max(1, k * 5);
      for (let s = first; s <= k * 5 + 4; s++) expect(combo(s)).toBe(combo(first));
    }
  });

  it.each(TOWER_TYPES)("%s: the 100 bundles of steps 1~499 all differ", (type) => {
    const keys = Array.from({ length: 100 }, (_, k) => `${type}|${combo(Math.max(1, k * 5))}`);
    expect(new Set(keys).size).toBe(100);
  });

  it("the step number changes every step", () => {
    for (let s = 1; s < 1100; s++) expect(lookOf(s + 1).step).not.toBe(lookOf(s).step);
  });
});

describe("500 and beyond (D50)", () => {
  it("stars: 499 none, 500 one, 1000 two", () => {
    expect(lookOf(499).star).toBe(0);
    expect(lookOf(500).star).toBe(1);
    expect(lookOf(999).star).toBe(1);
    expect(lookOf(1000).star).toBe(2);
  });

  it("499 and 500 look different", () => {
    expect(lookKey("rapid", 499)).not.toBe(lookKey("rapid", 500));
  });

  it("evolution, material, tier and body stay on the last one; barrel and ornament keep cycling", () => {
    const a = lookOf(500);
    const b = lookOf(735);
    expect([b.evo, b.mat, b.tier, b.body]).toEqual([a.evo, a.mat, a.tier, a.body]);
    expect([a.evo, a.mat, a.tier, a.body]).toEqual([4, 9, 5, 19]);
    expect(lookOf(510).bar).not.toBe(a.bar);
    expect(lookOf(505).orn).not.toBe(a.orn);
  });
});

describe("sizeOf", () => {
  it("follows the spot-size table", () => {
    expect(sizeOf(1)).toBeCloseTo(0.72);
    expect(sizeOf(5)).toBeCloseTo(0.74);
    expect(sizeOf(10)).toBeCloseTo(0.8);
    expect(sizeOf(25)).toBeCloseTo(0.86);
    expect(sizeOf(50)).toBeCloseTo(0.92);
    expect(sizeOf(100)).toBe(1);
    expect(sizeOf(400)).toBe(1);
  });
});

describe("nextLook", () => {
  it("names the next threshold", () => {
    expect(nextLook(47)).toEqual({ step: 50, left: 3, text: "50단계에 청동 타워 · 초록 테두리" });
    expect(nextLook(99)?.text).toBe("100단계에 III 전문형 · 은 타워 · 파랑 테두리");
    expect(nextLook(500)).toBeNull();
  });
});
