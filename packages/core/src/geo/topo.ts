// TopoJSON decoding and the nationwide map projection shared by the region picker and the national board.

export type Position = [number, number];
/** Rings of one polygon; the first ring is the outer boundary. */
export type Polygon = Position[][];

export type TopoGeometry<P = Record<string, unknown>> =
  | { type: "Polygon"; arcs: number[][]; properties?: P }
  | { type: "MultiPolygon"; arcs: number[][][]; properties?: P };

export type Topology<P = Record<string, unknown>> = {
  type: "Topology";
  arcs: number[][][];
  transform?: { scale: number[]; translate: number[] };
  objects: Record<string, { type: "GeometryCollection"; geometries: TopoGeometry<P>[] }>;
};

export function decodeTopology(topo: Topology<unknown>) {
  const t = topo.transform;
  const arcs: Position[][] = topo.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx = 0, dy = 0]) => {
      if (!t) return [dx, dy];
      x += dx;
      y += dy;
      return [x * t.scale[0]! + t.translate[0]!, y * t.scale[1]! + t.translate[1]!];
    });
  });

  const ring = (indices: number[]): Position[] => {
    const out: Position[] = [];
    indices.forEach((i, k) => {
      const arc = i < 0 ? arcs[~i]!.slice().reverse() : arcs[i]!;
      // Consecutive arcs share their joint point; keep it once.
      arc.forEach((p, j) => {
        if (k > 0 && j === 0) return;
        out.push(p);
      });
    });
    return out;
  };

  return {
    polygons(geom: TopoGeometry<unknown>): Polygon[] {
      return geom.type === "Polygon" ? [geom.arcs.map(ring)] : geom.arcs.map((p) => p.map(ring));
    },
  };
}

// Equirectangular projection scaled by cos(36°), covering mainland Korea, Jeju, Ulleung and Dokdo.
const LON0 = 124.45;
const LAT1 = 38.72;
const K = Math.cos((36 * Math.PI) / 180);
const S = 160;

export const KOREA_VIEW = {
  width: Math.round((132.0 - LON0) * K * S),
  height: Math.round((LAT1 - 33.05) * S),
};

export function projectKorea([lon, lat]: Position): Position {
  return [(lon - LON0) * K * S, (LAT1 - lat) * S];
}

const num = (v: number) => String(Number(v.toFixed(1)));

/** SVG path data; points closer than minStep (Manhattan, projected units) to the last kept point are dropped. */
export function polygonsToPath(polys: Polygon[], project: (p: Position) => Position, minStep: number): string {
  let d = "";
  for (const polygon of polys) {
    for (const ring of polygon) {
      let seg = "";
      let count = 0;
      let lx = 0;
      let ly = 0;
      ring.forEach((p, i) => {
        const [x, y] = project(p);
        const isLast = i === ring.length - 1;
        if (count > 0 && !isLast && Math.abs(x - lx) + Math.abs(y - ly) < minStep) return;
        seg += `${count ? "L" : "M"}${num(x)} ${num(y)}`;
        lx = x;
        ly = y;
        count++;
      });
      if (count > 2) d += `${seg}Z`;
    }
  }
  return d;
}
