import { describe, expect, it } from "vitest";
import { pointAt, polyline, polylineDistance, simplify, smooth, type BoardPoint } from "./geometry";
import { buildGrid } from "./grid";
import { labelOverlaps, layoutStageLabels, squareRect } from "./labels";
import { boardTowers, pickRepresentatives, type Guardian } from "./reps";
import { parseStageFile, STAGE_FORMAT, type StageFile } from "./schema";
import { placeSpots } from "./spots";

const guardian = (i: number, pts24: number, step = 10): Guardian => ({
  id: `g${i}`,
  nick: "n",
  tag: "0000",
  type: "rapid",
  step,
  pal: 0,
  pts24,
  joinedAt: i,
});

describe("representatives (D22)", () => {
  const many = Array.from({ length: 1000 }, (_, i) => guardian(i, (i * 7919) % 500));

  it("draws at most N + 1 towers for 1,000 guardians, my tower exactly once", () => {
    for (const n of [6, 8, 14]) {
      const me = guardian(5000, 3);
      const towers = boardTowers(many, me, n);
      expect(towers.length).toBeLessThanOrEqual(n + 1);
      expect(towers.filter((t) => t.me)).toHaveLength(1);
      expect(towers.find((t) => t.me)!.spot).toBe("mine");
    }
  });

  it("puts me on a representative spot and hides my spot when I am one", () => {
    const me = guardian(5000, 10_000);
    const towers = boardTowers(many, me, 8);
    expect(towers).toHaveLength(8);
    expect(towers.filter((t) => t.me)).toEqual([expect.objectContaining({ spot: "rep", index: 0 })]);
  });

  it("orders by 24h points, then step, then join; no points never qualifies", () => {
    const list = [guardian(0, 5, 1), guardian(1, 5, 9), guardian(2, 9), guardian(3, 0, 999), guardian(4, 5, 9)];
    expect(pickRepresentatives(list, 10).map((g) => g.id)).toEqual(["g2", "g1", "g4", "g0"]);
  });
});

describe("geometry", () => {
  it("walks a polyline by distance and stays on it", () => {
    const pl = polyline(smooth(simplify([[0, 0], [100, 0], [100, 100], [300, 120]], 1), 3));
    for (let d = -10; d <= pl.len + 10; d += 3.7) expect(polylineDistance(pointAt(pl, d), pl.pts)).toBeLessThan(1e-9);
    expect(pointAt(pl, pl.len + 50)).toEqual(pl.pts[pl.pts.length - 1]);
  });
});

describe("spot placement ladder", () => {
  // A 1000×1000 board whose region is a centred square with one straight path to the middle.
  const square: BoardPoint[] = [[100, 100], [900, 100], [900, 900], [100, 900], [100, 100]];
  const grid = buildGrid([[square]], 1000, 1000);
  const path: BoardPoint[] = [[100, 500], [500, 500]];
  const res = placeSpots({ width: 1000, height: 1000, grid, paths: [path], base: [500, 500], gates: [[100, 500]] });
  const all = [...res.repSpots, res.mySpot];

  it("keeps the step's spacing and path clearance", () => {
    expect(all.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < all.length; i++) {
      expect(polylineDistance(all[i]!, path)).toBeGreaterThanOrEqual(85);
      for (let j = i + 1; j < all.length; j++) {
        expect(Math.hypot(all[i]![0] - all[j]![0], all[i]![1] - all[j]![1])).toBeGreaterThanOrEqual(200);
      }
    }
  });

  it("makes my spot the one nearest the base", () => {
    const d = (p: BoardPoint) => Math.hypot(p[0] - 500, p[1] - 500);
    for (const p of res.repSpots) expect(d(res.mySpot)).toBeLessThanOrEqual(d(p));
  });
});

describe("stage file", () => {
  const stage: StageFile = {
    format: STAGE_FORMAT,
    code: "x",
    name: "시험군",
    board: { width: 1000, height: 800 },
    region: [[[[0, 0], [1000, 0], [1000, 800], [0, 800], [0, 0]]]],
    neighbors: [],
    neighborLabels: [{ name: "옆군", at: [500, 50] }],
    backgroundRoads: [],
    gates: [{ code: "y", name: "옆군", at: [0, 400] }],
    paths: [{ gate: 0, points: [[0, 400], [500, 400]] }],
    base: [500, 400],
    repSpots: [[300, 200], [700, 200]],
    mySpot: [500, 600],
    pace: { waveSec: 60, spawnWindowSec: 36, travelSec: { normal: 12, fast: 9, king: 15, boss: 17 }, leakSec: 9 },
    sources: { boundary: "b", roads: "r" },
  };

  it("accepts a valid file and rejects broken ones", () => {
    expect(parseStageFile(JSON.parse(JSON.stringify(stage))).code).toBe("x");
    expect(() => parseStageFile({ ...stage, format: 2 })).toThrow(/형식/);
    expect(() => parseStageFile({ ...stage, paths: [{ gate: 3, points: [[0, 0], [1, 1]] }] })).toThrow(/path/);
  });

  it("places labels clear of spots, gates and the base", () => {
    const v = { w: 340, h: 280, s: 0.33, ox: 5, oy: 8, D: 44 };
    const labels = layoutStageLabels(stage, v, (text) => ({ w: text.length * 13 + 12, h: 18 }));
    const rects = labels.map((l) => l.rect);
    const at = (p: BoardPoint, half: number) => squareRect(v.ox + p[0] * v.s, v.oy + p[1] * v.s, half);
    expect(labels.map((l) => l.kind)).toContain("gate");
    expect(labelOverlaps(rects, [...stage.repSpots, stage.mySpot].map((p) => at(p, 22)))).toBe(0);
    expect(labelOverlaps(rects, [at(stage.paths[0]!.points[0]!, 22), at(stage.base, 22)])).toBe(0);
  });
});
