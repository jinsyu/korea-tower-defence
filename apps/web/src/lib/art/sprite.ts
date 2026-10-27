// Bake a tower once per (type, step, colour, size, aim, recoil, view) and only stamp it afterwards (Q36).
// No runtime filters: the halo and outline are made by stamping tinted copies around the merged layers.
import { lookOf, sizeOf, type TowerType } from "@ktd/core";
import { asImage, ctx2d, makeCanvas, type ArtCanvas } from "./canvas";
import { DEEP, TIER_COLORS, YEL } from "./palette";
import { circle, rrectP, setUnitPx, starP } from "./shapes";
import { drawTierRing, drawTowerBody } from "./tower";

/** Sprite size and anchor relative to the spot diameter D. */
export const SPR_W = 1.3;
export const SPR_H = 1.34;
export const SPR_AX = 0.65;
export const SPR_AY = 0.74;
const CACHE_MAX = 500;
const AIM_STEPS = 24;

export type TowerSpriteOptions = {
  type: TowerType;
  step: number;
  pal: number;
  /** Spot diameter in CSS px. */
  D: number;
  /** Turret aim in radians (snapped to 24 directions). Default: up-right. */
  aim?: number;
  recoil?: boolean;
  /** Black silhouette with a light halo (asset QA view). */
  sil?: boolean;
  /** White silhouette (evolution flash). */
  white?: boolean;
  badge?: boolean;
  /** Device pixel ratio, capped at 2. Default: the screen's. */
  dpr?: number;
  /** Badge font family (CSS). */
  font?: string;
};

const cache = new Map<string, ArtCanvas>();

export function clearSpriteCache(): void {
  cache.clear();
}

export function spriteCacheSize(): number {
  return cache.size;
}

function screenDpr(): number {
  return typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
}

function aimIndex(aim: number): number {
  return ((Math.round((aim / (Math.PI * 2)) * AIM_STEPS) % AIM_STEPS) + AIM_STEPS) % AIM_STEPS;
}

type Frame = { W: number; H: number; k: number; ax: number; ay: number; dpr: number; aim: number };

function frameOf(o: TowerSpriteOptions): Frame {
  const dpr = Math.min(2, o.dpr ?? screenDpr());
  return {
    dpr,
    W: Math.ceil(o.D * SPR_W * dpr),
    H: Math.ceil(o.D * SPR_H * dpr),
    k: (o.D / 96) * dpr,
    ax: o.D * SPR_AX * dpr,
    ay: o.D * SPR_AY * dpr,
    aim: (aimIndex(o.aim ?? -Math.PI / 4) / AIM_STEPS) * Math.PI * 2,
  };
}

function drawLayers(o: TowerSpriteOptions, f: Frame): ArtCanvas {
  const c = makeCanvas(f.W, f.H);
  const g = ctx2d(c);
  g.setTransform(f.k, 0, 0, f.k, f.ax, f.ay);
  setUnitPx(f.k);
  drawTowerBody(g, o.type, o.step, o.pal, f.aim, !!o.recoil);
  return c;
}

/** Every layer merged, without outline, ring or badge (silhouette checks use its alpha). */
export function towerLayers(o: TowerSpriteOptions): ArtCanvas {
  return drawLayers(o, frameOf(o));
}

export function towerSprite(o: TowerSpriteOptions): ArtCanvas {
  const f = frameOf(o);
  const key = [
    o.type,
    o.step,
    o.pal,
    Math.round(o.D * 4),
    aimIndex(o.aim ?? -Math.PI / 4),
    o.recoil ? 1 : 0,
    o.sil ? 1 : 0,
    o.white ? 1 : 0,
    o.badge === false ? 0 : 1,
    f.dpr,
  ].join("|");
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const c = buildTowerSprite(o, f);
  cache.set(key, c);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return c;
}

function buildTowerSprite(o: TowerSpriteOptions, fr: Frame): ArtCanvas {
  const { W, H, k, ax, ay, dpr } = fr;
  const layers = drawLayers(o, fr);
  const tint = (col: string) => {
    const t = makeCanvas(W, H);
    const tg = ctx2d(t);
    tg.drawImage(asImage(layers), 0, 0);
    tg.globalCompositeOperation = "source-in";
    tg.fillStyle = col;
    tg.fillRect(0, 0, W, H);
    return t;
  };
  const out = makeCanvas(W, H);
  const f = ctx2d(out);
  const around = (src: ArtCanvas, r: number) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      f.drawImage(asImage(src), Math.cos(a) * r, Math.sin(a) * r);
    }
  };
  if (o.sil) {
    around(tint("rgba(255,255,255,.6)"), Math.max(1.5 * dpr, 2 * k));
    f.drawImage(asImage(tint("#000")), 0, 0);
    return out;
  }
  const L = lookOf(o.step);
  const sz = sizeOf(o.step);
  // Ground shadow and tier rim under the tower.
  f.save();
  f.setTransform(k, 0, 0, k, ax, ay);
  f.translate(0, 30);
  f.scale(sz, sz);
  f.translate(0, -30);
  f.fillStyle = "rgba(6,16,42,.4)";
  f.beginPath();
  f.ellipse(0, 35, 34, 10, 0, 0, Math.PI * 2);
  f.fill();
  if (!o.white) {
    f.translate(0, 32);
    drawTierRing(f, L.tier);
  }
  f.restore();
  if (o.white) {
    f.drawImage(asImage(tint("#FFFFFF")), 0, 0);
    return out;
  }
  // Sticker edge: light halo (6 units) then navy outline (4 units), once around the merged layers.
  around(tint("rgba(255,255,255,.42)"), 6 * k);
  around(tint(DEEP), 4 * k);
  f.drawImage(asImage(layers), 0, 0);
  if (o.badge !== false) drawBadge(f, o, L.tier, L.dot, ax, ay, dpr);
  if (L.star) drawStar(f, o.D, L.star, ax, ay, dpr, o.font);
  return out;
}

/** Step number badge on the base front; border = tier colour. Bundle position dots from 88px up. */
function drawBadge(
  f: CanvasRenderingContext2D,
  o: TowerSpriteOptions,
  tier: number,
  dot: number,
  ax: number,
  ay: number,
  dpr: number,
): void {
  const fs = Math.max(11, Math.min(18, o.D * 0.2)) * dpr;
  const text = String(o.step);
  f.font = `${Math.round(fs)}px ${o.font ?? "sans-serif"}`;
  const tw = f.measureText(text).width + fs * 0.55;
  const bh = fs * 1.15;
  const bx = ax - tw / 2;
  const by = ay + o.D * dpr * 0.5 - bh;
  const bp = new Path2D();
  rrectP(bp, bx, by, tw, bh, bh * 0.3);
  f.fillStyle = DEEP;
  f.fill(bp);
  f.strokeStyle = TIER_COLORS[tier] ?? TIER_COLORS[0];
  f.lineWidth = Math.max(1.4 * dpr, fs * 0.13);
  f.stroke(bp);
  f.fillStyle = "#fff";
  f.textAlign = "center";
  f.textBaseline = "middle";
  f.fillText(text, ax, by + bh * 0.54);
  if (o.D >= 88 && dot) {
    f.fillStyle = YEL;
    for (let i = 0; i < dot; i++) {
      circle(f, bx + tw + 5 * dpr + i * 6 * dpr, by + bh / 2, 2.2 * dpr);
      f.fill();
    }
  }
}

function drawStar(
  f: CanvasRenderingContext2D,
  D: number,
  stars: number,
  ax: number,
  ay: number,
  dpr: number,
  font: string | undefined,
): void {
  const sx = ax + D * 0.3 * dpr;
  const sy = ay - D * 0.36 * dpr;
  const r = D * 0.1 * dpr;
  f.fillStyle = YEL;
  f.strokeStyle = DEEP;
  f.lineWidth = Math.max(1.5, r * 0.22);
  f.lineJoin = "round";
  const p = starP(new Path2D(), sx, sy, r, r * 0.46);
  f.stroke(p);
  f.fill(p);
  if (stars > 1) {
    f.fillStyle = DEEP;
    f.font = `900 ${Math.round(r * 0.9)}px ${font ?? "sans-serif"}`;
    f.textAlign = "center";
    f.textBaseline = "middle";
    f.fillText(String(stars), sx, sy + r * 0.08);
  }
}
