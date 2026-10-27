// Builds the Pyeongchang (32540) test stage: apps/web/public/stages/dev/32540.json.
// Paths are mockup B's "fake roads" (grid path finding inside the border), not OSM roads; real stages come in T15-T16.
// Spot placement and labels use the shared rules in packages/core/src/stage, which T16 reuses as is.
// Usage: pnpm data:dev-fixture
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeTopology, type Topology } from "../../packages/core/src/geo/topo.ts";
import {
  clamp,
  pointInPolygons,
  polyline,
  simplify,
  smooth,
  type BoardPoint,
  type BoardPolygon,
} from "../../packages/core/src/stage/geometry.ts";
import { buildGrid, cellCenter } from "../../packages/core/src/stage/grid.ts";
import { STAGE_FORMAT, type StageFile } from "../../packages/core/src/stage/schema.ts";
import { SPOT_LADDER, placeSpots, type SpotResult } from "../../packages/core/src/stage/spots.ts";
import { estimateLabelSize, fixedRects, layoutStageLabels, overlapArea, type Rect } from "../../packages/core/src/stage/labels.ts";
import { fitBoard, isWide, mapBox } from "../../packages/core/src/stage/screen.ts";

const CODE = "32540"; // 평창군
const ENTRANCE_NEIGHBORS = ["32520", "32030", "32530", "32550"]; // 횡성·강릉·영월·정선
const BACKGROUND_PAIRS: [string, string | null][] = [
  ["32510", null], // 홍천 → base
  ["32030", "32550"], // 강릉 → 정선
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const srcDir = join(repoRoot, "data/source/gojang");
const outFile = join(repoRoot, "apps/web/public/stages/dev", `${CODE}.json`);

type IndexEntry = { code: string; name: string; sidoCode: string; bbox: [number, number, number, number]; point: [number, number] };
type Index = { sido: { code: string; file: string }[]; sigungu: IndexEntry[]; source: { attribution: string } };
type Props = { code: string; name: string };

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

const index = readJson<Index>(join(srcDir, "regions/20261001/index.json"));
const entry = (code: string) => index.sigungu.find((s) => s.code === code);
const R = entry(CODE)!;
const topo = readJson<Topology<Props>>(join(srcDir, "regions/20261001", index.sido.find((s) => s.code === R.sidoCode)!.file));
const dec = decodeTopology(topo as Topology<unknown>);
const geoms = topo.objects.sigungu!.geometries;
const geom = geoms.find((g) => g.properties!.code === CODE)!;

// Board projection: equirectangular scaled by cos(mid latitude), 8% padding, long side 1000.
const [w, s, e, n] = R.bbox;
const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
const W0 = (e - w) * k;
const H0 = n - s;
const pad = 0.08 * Math.max(W0, H0);
const K = 1000 / (Math.max(W0, H0) + 2 * pad);
const project = ([lon, lat]: [number, number]): BoardPoint => [((lon - w) * k + pad) * K, (n - lat + pad) * K];
const WW = (W0 + 2 * pad) * K;
const HH = (H0 + 2 * pad) * K;

const toBoard = (polys: [number, number][][][]): BoardPolygon[] => polys.map((p) => p.map((r) => r.map(project)));
const region = toBoard(dec.polygons(geom));

// Entrance of a neighbour = middle point of the longest shared border arc.
const arcSet = (g: (typeof geoms)[number]) => {
  const out = new Set<number>();
  const walk = (a: unknown): void => {
    if (Array.isArray(a)) a.forEach(walk);
    else if (typeof a === "number") out.add(a < 0 ? ~a : a);
  };
  walk(g.arcs);
  return out;
};
const mine = arcSet(geom);
function entranceOf(code: string): BoardPoint | null {
  const ng = geoms.find((g) => g.properties!.code === code);
  if (!ng) return null;
  const theirs = arcSet(ng);
  let best: [number, number][] | null = null;
  for (const a of mine) if (theirs.has(a) && (!best || dec.arcs[a]!.length > best.length)) best = dec.arcs[a]!;
  return best ? project(best[best.length >> 1]!) : null;
}

// Fake roads: cheapest grid path inside the border, with smooth noise as terrain and a border penalty.
const grid = buildGrid(region, WW, HH, 10);
const { cols, rows, cell: C, inside, depthIn } = grid;
const N = cols * rows;
const cost = new Float32Array(N);
for (let i = 0; i < N; i++) {
  if (!inside[i]) {
    cost[i] = Infinity;
    continue;
  }
  const x = (i % cols) * C;
  const y = ((i / cols) | 0) * C;
  const nz = 0.5 + 0.25 * Math.sin(x * 0.019 + 1.3) * Math.cos(y * 0.023 + 0.4) + 0.25 * Math.sin((x - y) * 0.011 + 2.1);
  cost[i] = 1 + 1.8 * nz + (depthIn[i]! < 4 ? (4 - depthIn[i]!) * 1.5 : 0);
}
const used = new Uint8Array(N);
const cellOf = ([x, y]: BoardPoint) => clamp(Math.floor(y / C), 0, rows - 1) * cols + clamp(Math.floor(x / C), 0, cols - 1);

function nearestInside(pt: BoardPoint, minDepth: number): number {
  const c0 = Math.floor(pt[0] / C);
  const r0 = Math.floor(pt[1] / C);
  for (let rad = 0; rad < 80; rad++) {
    let best = -1;
    let bd = Infinity;
    for (let r = r0 - rad; r <= r0 + rad; r++) {
      for (let c = c0 - rad; c <= c0 + rad; c++) {
        if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
        if (Math.max(Math.abs(r - r0), Math.abs(c - c0)) !== rad) continue;
        const i = r * cols + c;
        if (inside[i] && depthIn[i]! >= minDepth) {
          const d = Math.hypot(c - c0, r - r0);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
    }
    if (best >= 0) return best;
  }
  return cellOf(pt);
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size() {
    return this.keys.length;
  }
  push(key: number, val: number) {
    const { keys: k, vals: v } = this;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p]! <= v[i]!) break;
      [k[p], k[i]] = [k[i]!, k[p]!];
      [v[p], v[i]] = [v[i]!, v[p]!];
      i = p;
    }
  }
  pop(): number {
    const { keys: k, vals: v } = this;
    const top = k[0]!;
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && v[l]! < v[m]!) m = l;
        if (r < k.length && v[r]! < v[m]!) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i]!, k[m]!];
        [v[m], v[i]] = [v[i]!, v[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** A* over 8 neighbours; reuse makes cells used by earlier paths cheap so paths merge. */
function astar(a: number, b: number, reuse: boolean): number[] | null {
  const gS = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  const bc = b % cols;
  const br = (b / cols) | 0;
  gS[a] = 0;
  heap.push(a, 0);
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === b) break;
    const r = (i / cols) | 0;
    const c = i % cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        const j = rr * cols + cc;
        if (!inside[j] || closed[j]) continue;
        const cj = reuse && used[j] ? 0.35 : cost[j]!;
        const ng = gS[i]! + cj * (dr && dc ? 1.4142 : 1);
        if (ng < gS[j]!) {
          gS[j] = ng;
          from[j] = i;
          heap.push(j, ng + Math.hypot(rr - br, cc - bc) * 0.35);
        }
      }
    }
  }
  if (a !== b && from[b]! < 0) return null;
  const out = [b];
  let cur = b;
  while (cur !== a) {
    cur = from[cur]!;
    out.push(cur);
  }
  return out.reverse();
}

const baseCell = nearestInside(project(R.point), 3);
const base = cellCenter(grid, baseCell);
const road = (pts: BoardPoint[]) => smooth(simplify(pts, 7), 3);

const gates: StageFile["gates"] = [];
const paths: StageFile["paths"] = [];
for (const code of ENTRANCE_NEIGHBORS) {
  const at = entranceOf(code);
  if (!at) continue;
  const cells = astar(nearestInside(at, 2), baseCell, true);
  if (!cells) continue;
  cells.forEach((i) => (used[i] = 1));
  const pts = [at, ...cells.map((i) => cellCenter(grid, i))];
  pts[pts.length - 1] = [...base];
  gates.push({ code, name: entry(code)?.name ?? code, at });
  paths.push({ gate: gates.length - 1, points: road(pts) });
}

const backgroundRoads: BoardPoint[][] = [];
for (const [a, b] of BACKGROUND_PAIRS) {
  const ea = entranceOf(a);
  if (!ea) continue;
  const eb = b ? entranceOf(b) : null;
  const cells = astar(nearestInside(ea, 2), eb ? nearestInside(eb, 2) : baseCell, false);
  if (cells) backgroundRoads.push(road([ea, ...cells.map((i) => cellCenter(grid, i)), ...(eb ? [eb] : [])]));
}

const avoid: Rect[] = [];
const spotsWith = () =>
  placeSpots({ width: WW, height: HH, grid, paths: paths.map((p) => p.points), base, gates: paths.map((p) => p.points[0]!), avoid });
let spots: SpotResult = spotsWith();

// Neighbour outlines that reach the board, and names of land/link neighbours whose point is on the board.
const onBoard = (polys: BoardPolygon[]) =>
  polys.some((p) => p[0]!.some(([x, y]) => x > -50 && y > -50 && x < WW + 50 && y < HH + 50));
const neighbors = geoms
  .filter((g) => g !== geom)
  .map((g) => ({ code: g.properties!.code, name: g.properties!.name, polygons: toBoard(dec.polygons(g)) }))
  .filter((nb) => onBoard(nb.polygons));

type Adjacency = { cells: { code: string; neighbors: string[] }[] };
type Links = { links: { a: string; b: string }[] };
const adj = readJson<Adjacency>(join(srcDir, "board/adjacency-report.json"));
const links = readJson<Links>(join(srcDir, "board/links.json"));
const nbCodes = new Set<string>(adj.cells.find((c) => c.code === CODE)?.neighbors ?? []);
for (const l of links.links) {
  if (l.a === CODE) nbCodes.add(l.b);
  if (l.b === CODE) nbCodes.add(l.a);
}
const neighborLabels = [...nbCodes]
  .map((code) => entry(code))
  .filter((r): r is IndexEntry => !!r)
  .map((r) => ({ name: r.name, at: project(r.point) }))
  .filter(({ at: [x, y] }) => x > 20 && y > 20 && x < WW - 20 && y < HH - 20 && !pointInPolygons([x, y], region));

// Screen pace: a normal balloon crosses the longest path at about 55 units/s, 10–16 s; the others scale
// like mockup B (fast 8, king 14, boss 16 against normal 11). Spawns are spread over the whole wave; the screen
// keeps only those that can still pop by the hold limit before the wave ends.
const longest = Math.max(...paths.map((p) => polyline(p.points).len));
const normal = clamp(longest / 55, 10, 16);
const travelSec = { normal, fast: (normal * 8) / 11, king: (normal * 14) / 11, boss: (normal * 16) / 11 };
const WAVE_SEC = 60;
const pace: StageFile["pace"] = {
  waveSec: WAVE_SEC,
  spawnWindowSec: WAVE_SEC - 1,
  travelSec,
  leakSec: 9,
};

const stageOf = (sp: SpotResult): StageFile => ({
  format: STAGE_FORMAT,
  code: CODE,
  name: R.name,
  board: { width: WW, height: HH },
  region,
  neighbors,
  neighborLabels,
  backgroundRoads,
  gates,
  paths,
  base,
  repSpots: sp.repSpots,
  mySpot: sp.mySpot,
  pace,
  sources: {
    boundary: index.source.attribution,
    roads: "시험용 가짜 길(경계 안 격자 길찾기). 실제 판은 © OpenStreetMap 주요 도로",
    fakeRoads: true,
  },
});

// Labels that cannot find a free place next to their marker on a phone push the spots in their way elsewhere
// (spec "이름표 자리": 빈 곳이 없으면 겹치는 자리를 옮긴다).
const PHONES: [number, number][] = [
  [360, 640],
  [390, 844],
];
for (let round = 0; round < 8; round++) {
  const draft = stageOf(spots);
  let moved = false;
  for (const [vw, vh] of PHONES) {
    const box = mapBox(vw, vh);
    const v = fitBoard(box.w, box.h, draft.board);
    const spotRects = fixedRects(draft, v).spots;
    for (const l of layoutStageLabels(draft, v, estimateLabelSize(isWide(vw, vh)))) {
      if (!spotRects.some((r) => overlapArea(l.rect, r) > 0.5)) continue;
      const pad = v.D / 2 + 3;
      avoid.push({
        l: (l.rect.l - pad - v.ox) / v.s,
        t: (l.rect.t - pad - v.oy) / v.s,
        r: (l.rect.r + pad - v.ox) / v.s,
        b: (l.rect.b + pad - v.oy) / v.s,
      });
      moved = true;
    }
  }
  if (!moved) break;
  spots = spotsWith();
}
const stage = stageOf(spots);

const round = (_key: string, v: unknown) => (typeof v === "number" ? Math.round(v * 10) / 10 : v);
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(stage, round)}\n`);
const step = SPOT_LADDER[spots.step]!;
console.log(
  `${R.name} 판: 입구 ${gates.length}, 대표 자리 ${spots.repSpots.length} + 내 자리 1 (단계 ${spots.step + 1}: 간격 ${step.gap}, 군 밖 ${step.outside ? "허용" : "안 씀"}), ${Math.round(readFileSync(outFile).length / 1024)}KB → ${outFile}`,
);
