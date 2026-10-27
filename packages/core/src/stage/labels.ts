// Name labels on the board (mockup A·B review method): base and gate labels look around their anchor in
// 16 directions at a few distances and take the first place that touches no spot, gate, base or earlier label
// (2px margin). Paths and borders may run under a label. A label never sits farther than LABEL_MAX_GAP px beyond
// its marker, so a child can tell which gate it names; on crowded boards the text gets shorter instead
// ("횡성군 방면" → "횡성 방면" → "횡성"). Neighbour names are dropped when they would touch anything.
import { clamp, type BoardPoint } from "./geometry.ts";
import type { StageFile } from "./schema.ts";

export type Rect = { l: number; t: number; r: number; b: number };
export type LabelKind = "base" | "gate" | "nb";
export type PlacedLabel = {
  kind: LabelKind;
  text: string;
  rect: Rect;
  /** Screen point the label names and the half size of its marker. */
  anchor: BoardPoint;
  anchorHalf: number;
};
/** Board → screen mapping: x = ox + bx·s, y = oy + by·s; D = spot diameter in px. */
export type BoardView = { w: number; h: number; s: number; ox: number; oy: number; D: number };

/** Half size of the gate marker square in px. */
export const GATE_HALF = 22;
/** Most px between a marker's edge and its label (44px from the centre of a 44px marker). */
export const LABEL_MAX_GAP = 22;
const MARGIN = 2;
const EXTRAS = [0, 6, 12, 18];
const DIRS: [number, number][] = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0.5],
  [1, -0.5],
  [-1, 0.5],
  [-1, -0.5],
  [0.5, 1],
  [-0.5, 1],
  [0.5, -1],
  [-0.5, -1],
];

export const squareRect = (x: number, y: number, half: number): Rect => ({ l: x - half, t: y - half, r: x + half, b: y + half });
export const overlapArea = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

export const toScreen = (v: BoardView, p: BoardPoint): BoardPoint => [v.ox + p[0] * v.s, v.oy + p[1] * v.s];

/** Squares that labels must not touch: every spot, every gate marker, the base. */
export function fixedRects(stage: StageFile, v: BoardView): { spots: Rect[]; gates: Rect[]; base: Rect } {
  const sq = (p: BoardPoint, half: number) => {
    const [x, y] = toScreen(v, p);
    return squareRect(x, y, half);
  };
  return {
    spots: [...stage.repSpots, stage.mySpot].map((p) => sq(p, v.D / 2)),
    gates: stage.paths.map((pa) => sq(pa.points[0]!, GATE_HALF)),
    base: sq(stage.base, v.D * 0.5),
  };
}

export type MeasureLabel = (text: string, kind: LabelKind) => { w: number; h: number };

export function layoutStageLabels(stage: StageFile, v: BoardView, measure: MeasureLabel): PlacedLabel[] {
  const fixed = fixedRects(stage, v);
  const blockers = [...fixed.spots, ...fixed.gates, fixed.base];
  const placed: PlacedLabel[] = [];

  const add = (texts: string[], kind: LabelKind, anchor: BoardPoint, ar: number, dirs: [number, number][], must: boolean) => {
    const [ax, ay] = anchor;
    const maxDist = ar + LABEL_MAX_GAP;
    let best: { text: string; rect: Rect } | null = null;
    let bestScore = Infinity;
    for (const text of texts) {
      const { w, h } = measure(text, kind);
      for (const extra of EXTRAS) {
        for (const [ux, uy] of dirs) {
          const cx = ax + ux * (ar + 4 + extra + w / 2);
          const cy = ay + uy * (ar + 4 + extra + h / 2);
          const l = clamp(cx - w / 2, 4, Math.max(4, v.w - w - 4));
          const t = clamp(cy - h / 2, 6, Math.max(6, v.h - h - 14));
          const r: Rect = { l, t, r: l + w, b: t + h };
          if (kind !== "nb" && anchorDistance(anchor, r) > maxDist + 0.01) continue;
          const grown: Rect = { l: l - MARGIN, t: t - MARGIN, r: r.r + MARGIN, b: r.b + MARGIN };
          let score = 0;
          for (const o of blockers) score += overlapArea(grown, o);
          for (const o of placed) score += overlapArea(grown, o.rect);
          if (score < 0.5) {
            placed.push({ kind, text, rect: r, anchor, anchorHalf: ar });
            return;
          }
          if (score < bestScore) {
            bestScore = score;
            best = { text, rect: r };
          }
        }
      }
    }
    if (best && must) placed.push({ kind, ...best, anchor, anchorHalf: ar });
  };

  const base = toScreen(v, stage.base);
  add([`${stage.name} 본부`, "본부"], "base", base, v.D * 0.5, DIRS, true);
  for (const pa of stage.paths) {
    const gate = stage.gates[pa.gate]!;
    const g = toScreen(v, pa.points[0]!);
    const dx = g[0] - base[0];
    const dy = g[1] - base[1];
    // Prefer the directions pointing away from the base.
    const dirs = DIRS.slice().sort(
      (a, b) => (b[0] * dx + b[1] * dy) / Math.hypot(...b) - (a[0] * dx + a[1] * dy) / Math.hypot(...a),
    );
    const short = gate.name.length > 2 ? gate.name.replace(/[시군구]$/, "") : gate.name;
    add([`${gate.name} 방면`, `${short} 방면`, short], "gate", g, GATE_HALF, dirs, true);
  }
  for (const nb of stage.neighborLabels) {
    const p = toScreen(v, nb.at);
    if (p[0] < 0 || p[1] < 0 || p[0] > v.w || p[1] > v.h) continue;
    add([nb.name], "nb", p, 0, [[0, 0]], false);
  }
  return placed;
}

/**
 * Conservative label size without a browser (Hangul 1em, space 0.35em, other 0.62em, plus padding and 1px),
 * matching the label CSS: 12px (base 14px) on phones, 13px (base 15px) on wide screens.
 */
export function estimateLabelSize(wide: boolean): MeasureLabel {
  return (text, kind) => {
    const fs = kind === "base" ? (wide ? 15 : 14) : wide ? 13 : 12;
    let w = 0;
    for (const ch of text) w += /[\uAC00-\uD7A3]/.test(ch) ? fs : ch === " " ? fs * 0.35 : fs * 0.62;
    const padX = kind === "nb" ? 0 : wide ? 16 : 12;
    const padY = kind === "nb" ? 0 : wide ? 6 : 4;
    return { w: w + padX + (kind === "gate" ? 4 : 0) + 1, h: fs * 1.2 + padY + 1 };
  };
}

/** Screen distance from an anchor point to the nearest point of a label box. */
export function anchorDistance([x, y]: BoardPoint, r: Rect): number {
  return Math.hypot(Math.max(r.l - x, 0, x - r.r), Math.max(r.t - y, 0, y - r.b));
}

/** Label/marker overlaps above half a pixel (D63 counts; must be 0). */
export function labelOverlaps(labels: Rect[], markers: Rect[]): number {
  let n = 0;
  for (const a of labels) for (const m of markers) if (overlapArea(a, m) > 0.5) n++;
  return n;
}
