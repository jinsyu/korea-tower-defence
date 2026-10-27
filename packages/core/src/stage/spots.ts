// Spot placement (mockup B, third review). Reused for every real stage in T16.
//
// Inside a small rural region the road band, the base, the gates and a 200-unit spacing leave room for only
// about four spots. So spots inside the region are picked first and, when short, the neighbour land inside the
// board rectangle (30+ units outside the border) is allowed too. Candidates are every 10-unit cell centre,
// inside before outside, then nearest the path. The conditions are loosened step by step (LADDER) until
// TARGET spots (representatives + mine) are found; otherwise the step that found the most wins.
// Even the loosest spacing (200) keeps 44px spots apart on a 360×640 phone.
import { cellCenter, type BoardGrid } from "./grid.ts";
import { polylineDistance, type BoardPoint } from "./geometry.ts";

export type SpotStep = {
  /** Minimum centre distance between spots. */
  gap: number;
  /** Minimum distance from any path. */
  fromPath: number;
  fromBase: number;
  fromGate: number;
  /** Neighbour land may be used. */
  outside: boolean;
};

export const SPOT_LADDER: readonly SpotStep[] = [
  { gap: 240, fromPath: 115, fromBase: 240, fromGate: 220, outside: false },
  { gap: 220, fromPath: 100, fromBase: 210, fromGate: 180, outside: false },
  { gap: 220, fromPath: 100, fromBase: 210, fromGate: 180, outside: true },
  { gap: 200, fromPath: 85, fromBase: 180, fromGate: 150, outside: true },
];

/** Representatives + my spot wanted; more are never placed. */
export const SPOT_TARGET = 9;
export const SPOT_MAX = 12;
/** Board margin kept free so spot squares stay on the map (bottom: credit line). */
const EDGE = 90;
const EDGE_BOTTOM = 130;
/** Grid cells a candidate keeps from the region border, on either side. */
const BORDER_CELLS = 3;

export type SpotInput = {
  width: number;
  height: number;
  grid: BoardGrid;
  paths: BoardPoint[][];
  base: BoardPoint;
  gates: BoardPoint[];
  /** Board rectangles a spot centre must stay out of (name labels found in the way at phone size). */
  avoid?: { l: number; t: number; r: number; b: number }[];
};

export type SpotResult = { mySpot: BoardPoint; repSpots: BoardPoint[]; step: number };

type Candidate = { p: BoardPoint; inside: boolean; dPath: number; dBase: number; dGate: number };

function candidates({ width, height, grid, paths, base, gates, avoid = [] }: SpotInput): Candidate[] {
  const out: Candidate[] = [];
  const minLoose = Math.min(...SPOT_LADDER.map((s) => s.fromPath));
  for (let i = 0; i < grid.inside.length; i++) {
    const p = cellCenter(grid, i);
    if (p[0] < EDGE || p[0] > width - EDGE || p[1] < EDGE || p[1] > height - EDGE_BOTTOM) continue;
    if (avoid.some((a) => p[0] >= a.l && p[0] <= a.r && p[1] >= a.t && p[1] <= a.b)) continue;
    const inside = !!grid.inside[i];
    if ((inside ? grid.depthIn[i]! : grid.depthOut[i]!) < BORDER_CELLS) continue;
    const dPath = Math.min(...paths.map((pts) => polylineDistance(p, pts)));
    if (dPath < minLoose) continue;
    out.push({
      p,
      inside,
      dPath,
      dBase: Math.hypot(p[0] - base[0], p[1] - base[1]),
      dGate: Math.min(...gates.map((g) => Math.hypot(g[0] - p[0], g[1] - p[1]))),
    });
  }
  return out.sort((a, b) => Number(b.inside) - Number(a.inside) || a.dPath - b.dPath || a.dBase - b.dBase);
}

export function placeSpots(input: SpotInput): SpotResult {
  const cands = candidates(input);
  let best: BoardPoint[] = [];
  let bestStep = -1;
  for (const [stepIndex, s] of SPOT_LADDER.entries()) {
    const picked: BoardPoint[] = [];
    for (const c of cands) {
      if ((!s.outside && !c.inside) || c.dPath < s.fromPath || c.dBase < s.fromBase || c.dGate < s.fromGate) continue;
      if (picked.some((q) => Math.hypot(q[0] - c.p[0], q[1] - c.p[1]) < s.gap)) continue;
      picked.push(c.p);
      if (picked.length >= SPOT_MAX) break;
    }
    if (picked.length > best.length) {
      best = picked;
      bestStep = stepIndex;
    }
    if (best.length >= SPOT_TARGET) break;
  }
  if (best.length < 2) throw new Error(`자리를 ${best.length}개밖에 못 놓았어요.`);
  // My spot = the one nearest the base; the rest are representative spots.
  const { base } = input;
  const dist = (p: BoardPoint) => Math.hypot(p[0] - base[0], p[1] - base[1]);
  let mi = 0;
  best.forEach((p, i) => {
    if (dist(p) < dist(best[mi]!)) mi = i;
  });
  return { mySpot: best[mi]!, repSpots: best.filter((_, i) => i !== mi), step: bestStep };
}
