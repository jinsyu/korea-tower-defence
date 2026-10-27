// 1 ms bucket histogram, mergeable across worker processes.
// Bucket i holds values in (i - 1, i], so a percentile is reported as its bucket's upper bound
// (500.4 ms lands in 501 and fails a "<= 500" check).
export const HIST_MAX_MS = 60_000;

export function newHist(): number[] {
  return new Array(HIST_MAX_MS + 1).fill(0);
}

export function record(h: number[], valueMs: number) {
  h[Math.min(HIST_MAX_MS, Math.max(0, Math.ceil(valueMs)))]++;
}

export function merge(into: number[], from: number[]) {
  for (let i = 0; i < from.length; i++) into[i] += from[i];
}

export function count(h: number[]): number {
  return h.reduce((a, b) => a + b, 0);
}

export function percentile(h: number[], p: number): number | null {
  const total = count(h);
  if (total === 0) return null;
  const target = Math.ceil((total * p) / 100);
  let seen = 0;
  for (let i = 0; i < h.length; i++) {
    seen += h[i];
    if (seen >= target) return i;
  }
  return HIST_MAX_MS;
}

/** Sparse form for IPC: only non-zero buckets. */
export function toSparse(h: number[]): [number, number][] {
  const out: [number, number][] = [];
  h.forEach((v, i) => v && out.push([i, v]));
  return out;
}

export function fromSparse(s: [number, number][]): number[] {
  const h = newHist();
  for (const [i, v] of s) h[i] += v;
  return h;
}
