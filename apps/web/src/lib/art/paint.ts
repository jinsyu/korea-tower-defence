// Stamp baked sprites onto on-screen canvases (browser only).
import { SPR_AX, SPR_AY, towerSprite, type TowerSpriteOptions } from "./sprite";
import { asImage } from "./canvas";

export type LookOptions = Omit<TowerSpriteOptions, "D" | "dpr"> & {
  /** Use this spot diameter as is (asset sheet: canvas = sprite size). Otherwise fit the canvas. */
  fixD?: number;
  /** Dashed spot square (asset sheet). */
  spot?: boolean;
};

/** Size the canvas backing store to its CSS box × dpr (max 2) and return a context in CSS px. */
export function prepareCanvas(cv: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number; dpr: number } | null {
  const r = cv.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr);
  const h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  const g = cv.getContext("2d");
  if (!g) throw new Error("2d canvas context is not available");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, w, h);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w: r.width, h: r.height, dpr };
}

/** One tower on one canvas (previews, lists, the asset sheet). */
export function paintLook(cv: HTMLCanvasElement, o: LookOptions): void {
  const c = prepareCanvas(cv);
  if (!c) return;
  const { g, w, h, dpr } = c;
  const D = o.fixD ?? Math.min(w, h / 1.12) * 0.84;
  const cx = o.fixD ? D * SPR_AX : w / 2;
  const cy = o.fixD ? D * SPR_AY : h * 0.55;
  if (o.fixD && o.spot) {
    g.save();
    g.strokeStyle = "rgba(255,255,255,.28)";
    g.setLineDash([3, 3]);
    g.lineWidth = 1;
    g.strokeRect(cx - D / 2 + 0.5, cy - D / 2 + 0.5, D - 1, D - 1);
    g.restore();
  }
  const sp = towerSprite({ ...o, D, dpr });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(asImage(sp), (cx - D * SPR_AX) * dpr, (cy - D * SPR_AY) * dpr);
}
