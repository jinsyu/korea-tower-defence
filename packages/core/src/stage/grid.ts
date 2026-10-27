// A 10-unit raster of the board: which cells are inside the region and how far each is from the border.
import { pointInPolygons, type BoardPoint, type BoardPolygon } from "./geometry.ts";

export type BoardGrid = {
  cell: number;
  cols: number;
  rows: number;
  /** 1 when the cell centre is inside the region. */
  inside: Uint8Array;
  /** Cells to the nearest outside cell (0 outside). */
  depthIn: Float32Array;
  /** Cells to the nearest inside cell (0 inside). */
  depthOut: Float32Array;
};

function bfs(seed: (i: number) => boolean, cols: number, rows: number): Float32Array {
  const n = cols * rows;
  const dist = new Float32Array(n).fill(1e9);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (seed(i)) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h]!;
    const r = (i / cols) | 0;
    const c = i % cols;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc;
      if (dist[j]! > dist[i]! + 1) {
        dist[j] = dist[i]! + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}

export function buildGrid(region: BoardPolygon[], width: number, height: number, cell = 10): BoardGrid {
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  const inside = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      inside[r * cols + c] = pointInPolygons([c * cell + cell / 2, r * cell + cell / 2], region) ? 1 : 0;
    }
  }
  return {
    cell,
    cols,
    rows,
    inside,
    depthIn: bfs((i) => !inside[i], cols, rows),
    depthOut: bfs((i) => !!inside[i], cols, rows),
  };
}

export function cellCenter(g: BoardGrid, i: number): BoardPoint {
  return [(i % g.cols) * g.cell + g.cell / 2, ((i / g.cols) | 0) * g.cell + g.cell / 2];
}
