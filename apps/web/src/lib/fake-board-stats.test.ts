import { describe, expect, it } from "vitest";
import { fakeBoardStats, PER_RANK_MIN_SOLVERS } from "@/lib/fake-board-stats";
import { bandColor, BAND_COLORS, NO_GUARDIAN_COLOR } from "@/lib/fake-region-stats";
import { buildKoreaMap } from "@/lib/korea-map";
import { FAKE_BOARD, FAKE_REGION, FAKE_REGION_CODE } from "@/lib/stage/fake-region";

const map = buildKoreaMap({ regionStep: 2, sidoStep: 4 });
const codes = map.regions.map((r) => r.code);
const sidoOf = (code: string) => map.regions.find((r) => r.code === code)!.sidoCode;
const mine = { code: "32540", guardians: 4218, best: 1290, wave: 1284, online: 1036, today: 53214, solvers: 1290 };

describe("national board numbers (D59, D60)", () => {
  const stats = fakeBoardStats(codes, sidoOf, mine);

  it("paints all 185 regions in one of 5 best-wave colours or the no-guardian grey", () => {
    expect(stats.regions.size).toBe(185);
    const fills = [...stats.regions.values()].map(bandColor);
    for (const f of fills) expect([...BAND_COLORS, NO_GUARDIAN_COLOR]).toContain(f);
    expect(new Set(fills).size).toBe(6);
  });

  it("shows my region with the defence screen's numbers", () => {
    expect(stats.regions.get("32540")).toMatchObject({ guardians: 4218, best: 1290, wave: 1284, online: 1036, today: 53214 });
  });

  it("ranks guarded regions by best wave, high first", () => {
    const bests = stats.byWave.map((c) => stats.regions.get(c)!.best);
    expect(bests).toEqual([...bests].sort((a, b) => b - a));
    expect(stats.byWave).toHaveLength([...stats.regions.values()].filter((s) => s.guardians > 0).length);
    stats.byWave.forEach((c, i) => expect(stats.regions.get(c)!.rankWave).toBe(i + 1));
  });

  it("ranks today's correct answers per solver only where 3 or more guardians solved today (Q34)", () => {
    for (const [code, s] of stats.regions) {
      const ranked = stats.byPer.includes(code);
      expect(ranked).toBe(s.solvers >= PER_RANK_MIN_SOLVERS);
      if (ranked) expect(s.per).toBeCloseTo(s.today / s.solvers);
      else expect(s.rankPer).toBeNull();
    }
    const pers = stats.byPer.map((c) => stats.regions.get(c)!.per!);
    expect(pers).toEqual([...pers].sort((a, b) => b - a));
  });

  it("keeps regions without guardians at wave 1 with no rank", () => {
    const empty = [...stats.regions.values()].filter((s) => s.guardians === 0);
    expect(empty.length).toBeGreaterThan(0);
    for (const s of empty) expect(s).toMatchObject({ wave: 1, best: 0, band: -1, rankWave: null, rankPer: null });
  });
});

describe("one fake board for the board and the defence screen", () => {
  it("covers all 185 regions and gives the defence screen the board's rank for my region", () => {
    expect(FAKE_BOARD.regions.size).toBe(185);
    expect(FAKE_REGION.rank).toBe(FAKE_BOARD.regions.get(FAKE_REGION_CODE)!.rankWave);
    expect(FAKE_BOARD.regions.get(FAKE_REGION_CODE)).toMatchObject({ best: FAKE_REGION.best, guardians: FAKE_REGION.guardians });
  });
});
