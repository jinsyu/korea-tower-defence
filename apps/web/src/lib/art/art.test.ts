// Draws the real art code into @napi-rs/canvas (Skia) so silhouettes can be checked without a browser.
import { createCanvas, Path2D as SkiaPath2D } from "@napi-rs/canvas";
import { BALLOON_KINDS, EVO_AT, MAT_AT, TIER_AT, TOWER_TYPES, type TowerType } from "@ktd/core";
import { beforeAll, describe, expect, it } from "vitest";
import { drawBalloon } from "./balloon";
import { ctx2d, makeCanvas, setCanvasFactory, type ArtCanvas } from "./canvas";
import { hexToOklch, tones } from "./color";
import { PALETTE, layerColors } from "./palette";
import { clearSpriteCache, spriteCacheSize, towerLayers, towerSprite } from "./sprite";
import { drawBarrels, drawBase, drawOrn, drawTierRing } from "./tower";

beforeAll(() => {
  globalThis.Path2D = SkiaPath2D as unknown as typeof Path2D;
  setCanvasFactory((w, h) => createCanvas(w, h) as unknown as ArtCanvas);
});

function alphaMask(c: ArtCanvas, cut = 128): Uint8Array {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
  const m = new Uint8Array(c.width * c.height);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3]! >= cut ? 1 : 0;
  return m;
}
function fnv(bytes: ArrayLike<number>): number {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 16777619);
  return h >>> 0;
}
function difference(a: Uint8Array, b: Uint8Array): number {
  let both = 0;
  let any = 0;
  for (let i = 0; i < a.length; i++) {
    both += a[i]! & b[i]!;
    any += a[i]! | b[i]!;
  }
  return any ? 1 - both / any : 0;
}
const filled = (m: Uint8Array) => m.reduce((n, v) => n + v, 0);

/** Black silhouette of every layer merged, 88px spot, alpha cut at 50%. */
const silhouette = (type: TowerType, step: number) => alphaMask(towerLayers({ type, step, pal: 0, D: 88, dpr: 1 }));

// Besides distinct hashes, masks must differ by a real amount (1 - IoU). Measured 2026-10-27:
// types 0.143, stages 0.095 at the closest pair; the bounds below guard against regressions.
describe("silhouettes at 88px (D51)", () => {
  const masks = new Map<string, Uint8Array>();
  const mask = (t: TowerType, s: number) => {
    const k = `${t}|${s}`;
    if (!masks.has(k)) masks.set(k, silhouette(t, s));
    return masks.get(k)!;
  };

  it.each([...EVO_AT])("step %i: the three types have different mask hashes", (s) => {
    const hashes = TOWER_TYPES.map((t) => fnv(mask(t, s)));
    expect(new Set(hashes).size).toBe(3);
    for (let i = 0; i < 3; i++)
      for (let j = i + 1; j < 3; j++)
        expect(difference(mask(TOWER_TYPES[i]!, s), mask(TOWER_TYPES[j]!, s))).toBeGreaterThan(0.1);
  });

  it.each([...TOWER_TYPES])("%s: the five evolution stages have different mask hashes", (t) => {
    const hashes = EVO_AT.map((s) => fnv(mask(t, s)));
    expect(new Set(hashes).size).toBe(5);
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++) expect(difference(mask(t, EVO_AT[i]!), mask(t, EVO_AT[j]!))).toBeGreaterThan(0.05);
  });
});

describe("every layer the look rules point to is drawn (D51)", () => {
  const paints = (draw: (g: CanvasRenderingContext2D) => void) => {
    const c = makeCanvas(80, 80);
    const g = ctx2d(c);
    g.translate(40, 40);
    draw(g);
    return filled(alphaMask(c, 1));
  };

  it("10 materials as a base", () => {
    for (let m = 0; m < MAT_AT.length; m++) expect(paints((g) => drawBase(g, m))).toBeGreaterThan(300);
  });
  it("6 tier rims", () => {
    for (let t = 0; t < TIER_AT.length; t++) expect(paints((g) => drawTierRing(g, t))).toBeGreaterThan(300);
  });
  it("20 ornaments", () => {
    for (let o = 0; o < 20; o++) expect(paints((g) => drawOrn(g, o, 0, 0, 2))).toBeGreaterThan(60);
  });
  it("10 barrels per type, each a different shape", () => {
    for (const t of TOWER_TYPES) {
      const hashes = new Set<number>();
      for (let b = 0; b < 10; b++) {
        const c = makeCanvas(80, 80);
        const g = ctx2d(c);
        g.translate(20, 40);
        g.scale(2, 2);
        drawBarrels(g, t, b, 9, tones("#6E7F99"));
        expect(filled(alphaMask(c, 1))).toBeGreaterThan(60);
        hashes.add(fnv(alphaMask(c)));
      }
      expect(hashes.size).toBe(10);
    }
  });

  it("neighbouring 5-step bundles render differently at 88px (all types, steps 1~499)", () => {
    for (const type of TOWER_TYPES) {
      let prev = -1;
      for (let k = 0; k < 100; k++) {
        const step = Math.max(1, k * 5);
        const c = towerSprite({ type, step, pal: 0, D: 88, dpr: 1, badge: false });
        const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data;
        const h = fnv(d);
        expect(h, `${type} bundle ${k}`).not.toBe(prev);
        prev = h;
      }
    }
  });
});

describe("colours", () => {
  it("the picked colour only changes the body; material and tier ignore it (D50)", () => {
    for (const step of [1, 10, 25, 50, 100, 200, 300, 500, 1000]) {
      const base = layerColors(step, 0);
      for (let p = 1; p < PALETTE.length; p++) {
        const c = layerColors(step, p);
        expect(c.material).toBe(base.material);
        expect(c.tier).toBe(base.tier);
        expect(c.body.b).not.toBe(base.body.b);
      }
    }
  });

  it("body colour is at least 0.35 lighter (OKLCH L) than the board navy", () => {
    const navyL = hexToOklch("#0B1B3A")[0];
    for (let p = 0; p < PALETTE.length; p++) {
      expect(hexToOklch(layerColors(1, p).body.b)[0] - navyL).toBeGreaterThanOrEqual(0.35);
    }
  });

  it("three-tone cel shading follows the OKLCH rule", () => {
    const t = tones("#FFD60A");
    const [L] = hexToOklch(t.b);
    expect(hexToOklch(t.s)[0]).toBeCloseTo(L - 0.12, 1);
    expect(hexToOklch(t.h)[0]).toBeGreaterThan(L);
  });
});

describe("sprite cache (Q36)", () => {
  it("returns the baked sprite on a hit and keeps at most 500", () => {
    clearSpriteCache();
    const a = towerSprite({ type: "rapid", step: 3, pal: 0, D: 12, dpr: 1 });
    expect(towerSprite({ type: "rapid", step: 3, pal: 0, D: 12, dpr: 1 })).toBe(a);
    for (let s = 1; s <= 520; s++) towerSprite({ type: "slow", step: s, pal: 1, D: 12, dpr: 1, badge: false });
    expect(spriteCacheSize()).toBe(500);
    expect(towerSprite({ type: "rapid", step: 3, pal: 0, D: 12, dpr: 1 })).not.toBe(a);
  });

  it("caps device pixel ratio at 2", () => {
    const c = towerSprite({ type: "splash", step: 1, pal: 0, D: 44, dpr: 3, badge: false });
    const c2 = towerSprite({ type: "splash", step: 1, pal: 0, D: 44, dpr: 2, badge: false });
    expect([c.width, c.height]).toEqual([c2.width, c2.height]);
  });
});

describe("balloons (D78)", () => {
  const draw = (kind: (typeof BALLOON_KINDS)[number]["kind"], hp = 1) => {
    const c = makeCanvas(120, 100);
    drawBalloon(ctx2d(c), 60, 55, 12, kind, { hp });
    return alphaMask(c, 1);
  };

  it("all four kinds draw with different shapes", () => {
    const hashes = BALLOON_KINDS.map((k) => fnv(draw(k.kind)));
    expect(new Set(hashes).size).toBe(4);
  });

  it("boss is wider than tall; normal is taller than wide", () => {
    const span = (m: Uint8Array) => {
      let x0 = 999, x1 = -1, y0 = 999, y1 = -1;
      m.forEach((v, i) => {
        if (!v) return;
        const x = i % 120, y = Math.floor(i / 120);
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      });
      return { w: x1 - x0, h: y1 - y0 };
    };
    const boss = span(draw("boss"));
    expect(boss.w).toBeGreaterThan(boss.h);
    const normal = span(draw("normal"));
    expect(normal.h).toBeGreaterThan(normal.w);
  });

  it("health states change the picture at the boundaries", () => {
    const pixels = (kind: "king" | "boss", hp: number) => {
      const c = makeCanvas(120, 100);
      drawBalloon(ctx2d(c), 60, 55, 12, kind, { hp });
      return fnv(ctx2d(c).getImageData(0, 0, 120, 100).data);
    };
    expect(pixels("king", 0.5)).not.toBe(pixels("king", 0.51));
    expect(pixels("boss", 0.66)).not.toBe(pixels("boss", 0.67));
    expect(pixels("boss", 0.33)).not.toBe(pixels("boss", 0.34));
  });
});

