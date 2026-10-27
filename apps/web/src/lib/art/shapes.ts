// Drawing helpers shared by towers and balloons, ported from mockup B.
import { tones, type Tones } from "./color";
import { CYAN, DEEP, MAT_COLORS } from "./palette";

type G = CanvasRenderingContext2D;
export type Box = [number, number, number, number];

/** Device pixels per art unit on the canvas being drawn. Inner lines thinner than 1px are skipped. */
let unitPx = 1;
export function setUnitPx(k: number): void {
  unitPx = k;
}

export function rrectP(p: Path2D, x: number, y: number, w: number, h: number, r: number): void {
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

export function starP(p: Path2D, x: number, y: number, r1: number, r2: number, n = 5): Path2D {
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    if (i) p.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else p.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  p.closePath();
  return p;
}

export function circle(g: G, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

/** Inner line (2 units). The merged outer outline is added once by the sprite builder. */
export function inl(g: G, path: Path2D, w = 2): void {
  if (unitPx * w < 1) return;
  g.save();
  g.strokeStyle = DEEP;
  g.globalAlpha = 0.8;
  g.lineWidth = w;
  g.lineJoin = "round";
  g.stroke(path);
  g.restore();
}

/** One face in three tones: base, lower-right shadow, upper-left light, ±6% vertical, cyan rim light on the right. */
export function celFill(g: G, path: Path2D, box: Box, t: Tones, o: { rim?: boolean; rimW?: number } = {}): void {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  g.save();
  g.fillStyle = t.b;
  g.fill(path);
  g.clip(path);
  g.fillStyle = t.s;
  g.beginPath();
  g.moveTo(x0 + w * 0.62, y0 - 2);
  g.lineTo(x1 + 2, y0 - 2);
  g.lineTo(x1 + 2, y1 + 2);
  g.lineTo(x0 + w * 0.4, y1 + 2);
  g.closePath();
  g.fill();
  g.fillStyle = t.h;
  g.beginPath();
  g.moveTo(x0 - 2, y0 - 2);
  g.lineTo(x0 + w * 0.42, y0 - 2);
  g.lineTo(x0 + w * 0.16, y0 + h * 0.55);
  g.lineTo(x0 - 2, y0 + h * 0.7);
  g.closePath();
  g.fill();
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, "rgba(255,255,255,.06)");
  gr.addColorStop(1, "rgba(0,0,0,.06)");
  g.fillStyle = gr;
  g.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
  if (o.rim !== false) {
    g.beginPath();
    g.rect(x0 + w * 0.72, y0 - 4, w, h + 8);
    g.clip();
    g.strokeStyle = CYAN;
    g.globalAlpha = 0.85;
    g.lineWidth = o.rimW ?? 4;
    g.stroke(path);
  }
  g.restore();
}

export const matTone = (mi: number): Tones => tones(MAT_COLORS[mi] ?? MAT_COLORS[0]);

const PRISM = ["#FF6B6B", "#FFC93C", "#4ADE80", "#22D3EE", "#7C83FF", "#E36BFF"];

/** Material: fixed material colour plus its texture (grain, bricks, rivets, glints, facets, rainbow). */
export function matFill(g: G, path: Path2D, box: Box, mi: number): void {
  const [x0, y0, x1, y1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  if (mi === 9) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    PRISM.forEach((c, i) => gr.addColorStop(i / (PRISM.length - 1), c));
    g.save();
    g.fillStyle = gr;
    g.fill(path);
    g.restore();
  } else {
    g.save();
    if (mi === 7) g.globalAlpha = 0.82;
    celFill(g, path, box, matTone(mi), { rim: mi === 5 });
    g.restore();
  }
  g.save();
  g.clip(path);
  g.lineWidth = 1.6;
  const dk = "rgba(6,16,42,.55)";
  const lt = "rgba(255,255,255,.75)";
  if (mi === 0) {
    g.strokeStyle = dk;
    for (const f of [0.38, 0.72]) {
      g.beginPath();
      g.moveTo(x0, y0 + h * f);
      g.bezierCurveTo(x0 + w * 0.3, y0 + h * (f - 0.2), x0 + w * 0.62, y0 + h * (f + 0.2), x1, y0 + h * f);
      g.stroke();
    }
    g.strokeStyle = "#F0D49A";
    g.lineWidth = 2.2;
    const cx = x0 + w * 0.5;
    g.beginPath();
    g.moveTo(cx - 5, y0 + 1);
    g.lineTo(cx + 5, y1 - 1);
    g.moveTo(cx + 5, y0 + 1);
    g.lineTo(cx - 5, y1 - 1);
    g.stroke();
  } else if (mi === 1) {
    g.strokeStyle = dk;
    g.beginPath();
    g.moveTo(x0, y0 + h * 0.5);
    g.lineTo(x1, y0 + h * 0.5);
    for (let x = x0 + 7; x < x1; x += 13) {
      g.moveTo(x, y0);
      g.lineTo(x, y0 + h * 0.5);
      g.moveTo(x + 6.5, y0 + h * 0.5);
      g.lineTo(x + 6.5, y1);
    }
    g.stroke();
  } else if (mi === 2 || mi === 3) {
    for (let i = 0; i < 4; i++) {
      const rx = x0 + w * (0.14 + i * 0.24);
      const ry = y0 + h * 0.5;
      g.fillStyle = "rgba(6,16,42,.6)";
      circle(g, rx, ry, 1.9);
      g.fill();
      g.fillStyle = lt;
      circle(g, rx - 0.6, ry - 0.6, 0.7);
      g.fill();
    }
    g.beginPath();
    if (mi === 3) {
      g.strokeStyle = "rgba(255,230,150,.85)";
      g.moveTo(x0, y0 + h * 0.2);
      g.lineTo(x1, y0 + h * 0.2);
      g.moveTo(x0, y1 - h * 0.2);
      g.lineTo(x1, y1 - h * 0.2);
    } else {
      g.strokeStyle = lt;
      g.lineWidth = 1;
      g.moveTo(x0 + 2, y0 + h * 0.22);
      g.lineTo(x0 + w * 0.5, y0 + h * 0.22);
    }
    g.stroke();
  } else if (mi === 4) {
    g.strokeStyle = "rgba(255,255,255,.95)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0 + w * 0.18, y1);
    g.lineTo(x0 + w * 0.32, y0);
    g.moveTo(x0 + w * 0.3, y1);
    g.lineTo(x0 + w * 0.42, y0);
    g.stroke();
  } else if (mi === 5) {
    g.strokeStyle = CYAN;
    g.beginPath();
    for (let x = x0 + w * 0.25; x < x1; x += w * 0.25) {
      g.moveTo(x, y0);
      g.lineTo(x - 3, y1);
    }
    g.stroke();
  } else if (mi === 6) {
    g.fillStyle = "rgba(150,80,0,.55)";
    const cy = y0 + h * 0.5;
    for (let x = x0 + 6; x < x1; x += 10) {
      g.beginPath();
      g.moveTo(x, cy - 3);
      g.lineTo(x + 3, cy);
      g.lineTo(x, cy + 3);
      g.lineTo(x - 3, cy);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#fff";
    circle(g, x0 + w * 0.24, y0 + h * 0.3, 1.3);
    g.fill();
  } else if (mi === 7 || mi === 8) {
    g.fillStyle = "rgba(255,255,255,.32)";
    for (let i = 1; i < 4; i += 2) {
      const xa = x0 + (w * i) / 4;
      g.beginPath();
      g.moveTo(xa, y1);
      g.lineTo(xa + w / 8, y0);
      g.lineTo(xa + w / 4, y1);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = mi === 8 ? "#FF9BE0" : "rgba(255,255,255,.85)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      const xa = x0 + (w * i) / 4;
      g.moveTo(xa, y1);
      g.lineTo(xa + w / 8, y0);
    }
    g.stroke();
  } else {
    g.fillStyle = "rgba(255,255,255,.45)";
    g.beginPath();
    g.moveTo(x0 + w * 0.2, y0);
    g.lineTo(x0 + w * 0.34, y0);
    g.lineTo(x0 + w * 0.18, y1);
    g.lineTo(x0 + w * 0.04, y1);
    g.closePath();
    g.fill();
  }
  g.restore();
}
