// Plane geometry on board coordinates (long side 1000). Shared by the stage builder, the screen and tests.

export type BoardPoint = [number, number];
/** Rings of one polygon; the first ring is the outer boundary. */
export type BoardPolygon = BoardPoint[][];

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Even-odd point-in-polygon over every ring of every polygon. */
export function pointInPolygons([px, py]: BoardPoint, polys: BoardPolygon[]): boolean {
  let inside = false;
  for (const polygon of polys) {
    for (const ring of polygon) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i]!;
        const [xj, yj] = ring[j]!;
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
  }
  return inside;
}

export function segmentDistance(p: BoardPoint, a: BoardPoint, b: BoardPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function polylineDistance(p: BoardPoint, pts: BoardPoint[]): number {
  let m = Infinity;
  for (let i = 1; i < pts.length; i++) m = Math.min(m, segmentDistance(p, pts[i - 1]!, pts[i]!));
  return m;
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(pts: BoardPoint[], eps: number): BoardPoint[] {
  if (pts.length < 3) return pts;
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  let md = 0;
  let mi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = segmentDistance(pts[i]!, a, b);
    if (d > md) {
      md = d;
      mi = i;
    }
  }
  if (md <= eps) return [a, b];
  return simplify(pts.slice(0, mi + 1), eps).slice(0, -1).concat(simplify(pts.slice(mi), eps));
}

/** Chaikin corner cutting; end points stay. */
export function smooth(pts: BoardPoint[], iterations: number): BoardPoint[] {
  let out = pts;
  for (let k = 0; k < iterations; k++) {
    const next: BoardPoint[] = [out[0]!];
    for (let i = 0; i < out.length - 1; i++) {
      const [x0, y0] = out[i]!;
      const [x1, y1] = out[i + 1]!;
      next.push([x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25], [x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75]);
    }
    next.push(out[out.length - 1]!);
    out = next;
  }
  return out;
}

/** A polyline with cumulative lengths, for walking a distance along it. */
export type Polyline = { pts: BoardPoint[]; cum: number[]; len: number };

export function polyline(pts: BoardPoint[]): Polyline {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  }
  return { pts, cum, len: cum[cum.length - 1]! };
}

/** Point at distance d from the start (clamped to the ends). */
export function pointAt(pl: Polyline, d: number): BoardPoint {
  const { cum, pts } = pl;
  if (d <= 0) return pts[0]!;
  if (d >= pl.len) return pts[pts.length - 1]!;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m]! <= d) lo = m;
    else hi = m;
  }
  const t = (d - cum[lo]!) / (cum[hi]! - cum[lo]! || 1);
  const a = pts[lo]!;
  const b = pts[hi]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
