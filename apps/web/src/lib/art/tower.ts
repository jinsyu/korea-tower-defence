// Tower layers, ported from mockup B (Q36). One 96-unit grid, origin = spot centre, ground at y 30.
// Edit shapes here: silhouette per evolution stage plus parameters (bands, rivets, horns, windows).
import { lookOf, sizeOf, type Look, type TowerType } from "@ktd/core";
import { tones, type Tones } from "./color";
import { DEEP, MAT_COLORS, RED, TIER_COLORS, YEL, CYAN, bodyTones } from "./palette";
import { celFill, circle, inl, matFill, matTone, rrectP, starP, type Box } from "./shapes";

type G = CanvasRenderingContext2D;
type Y = (y: number) => number;

const TAPE = "#F3E3B3";

/** Base: an elliptic cylinder whose top face shows (3/4 view), in the material. */
export function drawBase(g: G, mi: number): void {
  const rx = 30;
  const top = 22;
  const bot = 30;
  const ry = 8;
  const p = new Path2D();
  p.ellipse(0, top, rx, ry, 0, Math.PI, Math.PI * 2);
  p.lineTo(rx, bot);
  p.ellipse(0, bot, rx, ry, 0, 0, Math.PI);
  p.closePath();
  matFill(g, p, [-rx, top - ry, rx, bot + ry], mi);
  const tp = new Path2D();
  tp.ellipse(0, top, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = mi === 9 ? "#FFF1C9" : matTone(mi).h;
  g.fill(tp);
  g.strokeStyle = "rgba(255,255,255,.55)";
  g.lineWidth = 1.5;
  g.beginPath();
  g.ellipse(0, top, rx - 3, ry - 2.2, 0, Math.PI * 1.08, Math.PI * 1.55);
  g.stroke();
  inl(g, tp);
  inl(g, p);
}

/** Tier rim around the base on the ground (centre 0,0). Gold is a gradient. */
export function drawTierRing(g: G, tier: number): void {
  let st: string | CanvasGradient = TIER_COLORS[tier] ?? TIER_COLORS[0];
  if (tier === 5) {
    const gr = g.createLinearGradient(-40, 0, 40, 0);
    gr.addColorStop(0, "#FFB703");
    gr.addColorStop(0.5, "#FFF6C8");
    gr.addColorStop(1, "#FFB703");
    st = gr;
  }
  g.save();
  g.strokeStyle = DEEP;
  g.lineWidth = 9;
  g.beginPath();
  g.ellipse(0, 0, 40, 13, 0, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = st;
  g.globalAlpha = tier ? 1 : 0.85;
  g.lineWidth = 5.4;
  g.stroke();
  g.restore();
}

function roll(g: G, x: number, y: number, r: number): void {
  const p = new Path2D();
  p.arc(x, y, r, 0, Math.PI * 2);
  celFill(g, p, [x - r, y - r, x + r, y + r], tones(TAPE), { rim: false });
  g.strokeStyle = "rgba(150,110,40,.65)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.arc(x, y, r * 0.68, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = DEEP;
  circle(g, x, y, r * 0.34);
  g.fill();
  inl(g, p);
}

function wings(g: G, Y: Y): void {
  for (const s of [-1, 1]) {
    const w = new Path2D();
    w.moveTo(s * 8, Y(-8));
    w.bezierCurveTo(s * 24, Y(-34), s * 40, Y(-40), s * 46, Y(-32));
    w.lineTo(s * 38, Y(-24));
    w.lineTo(s * 45, Y(-18));
    w.lineTo(s * 35, Y(-11));
    w.lineTo(s * 39, Y(-3));
    w.lineTo(s * 14, 6);
    w.closePath();
    celFill(g, w, s < 0 ? [-46, Y(-40), -8, 6] : [8, Y(-40), 46, 6], tones("#FFF4C2"), { rim: s > 0 });
    inl(g, w);
    g.strokeStyle = "rgba(199,132,62,.8)";
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(s * 14, Y(-6));
    g.lineTo(s * 36, Y(-26));
    g.moveTo(s * 14, 0);
    g.lineTo(s * 34, Y(-12));
    g.stroke();
  }
}

function crown(g: G, x: number, y: number): void {
  const p = new Path2D();
  p.moveTo(x - 7, y);
  p.lineTo(x - 8.5, y - 9);
  p.lineTo(x - 3.5, y - 4.5);
  p.lineTo(x, y - 11);
  p.lineTo(x + 3.5, y - 4.5);
  p.lineTo(x + 8.5, y - 9);
  p.lineTo(x + 7, y);
  p.closePath();
  celFill(g, p, [x - 8.5, y - 11, x + 8.5, y], tones("#FFC93C"), { rim: false });
  inl(g, p);
  g.fillStyle = RED;
  circle(g, x, y - 3, 1.6);
  g.fill();
}

function eyes(g: G, list: [number, number][]): void {
  for (const [x, y] of list) {
    g.fillStyle = DEEP;
    g.beginPath();
    g.ellipse(x, y, 4.6, 5.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    circle(g, x - 1.4, y - 2, 1.7);
    g.fill();
  }
}

type Body = {
  path: Path2D;
  box: Box;
  head: [number, number, number];
  orn: [number, number];
  eyes: [number, number][];
  emb: [number, number] | null;
  back?: (g: G, T: Tones, mi: number) => void;
  front?: (g: G, T: Tones, mi: number) => void;
  cap?: (g: G, hx: number, hy: number, r: number, mi: number) => void;
  top?: (g: G) => void;
};

/** Shape language: rapid = narrow and pointed (1:1.4), splash = wide low drum (1.3:1), slow = square with a big roll. */
const BODY: Record<TowerType, (Y: Y, L: Look) => Body> = {
  rapid(Y, L) {
    const p = new Path2D();
    p.moveTo(-17, 22);
    p.lineTo(-11, Y(-14));
    p.lineTo(0, Y(-25));
    p.lineTo(11, Y(-14));
    p.lineTo(17, 22);
    p.closePath();
    return {
      path: p,
      box: [-17, Y(-25), 17, 22],
      head: [0, Y(-19), 8.5],
      orn: [-15, Y(-11)],
      eyes: [
        [-5.8, Y(-1)],
        [5.8, Y(-1)],
      ],
      emb: [0, Y(10)],
      back(g, T) {
        if (L.evo >= 4) wings(g, Y);
        if (L.evo >= 1)
          for (const s of [-1, 1]) {
            const f = new Path2D();
            f.moveTo(s * 11, Y(-5));
            f.lineTo(s * 30, Y(15));
            f.lineTo(s * 28, 24);
            f.lineTo(s * 14, 20);
            f.closePath();
            celFill(g, f, s < 0 ? [-30, Y(-5), -11, 24] : [11, Y(-5), 30, 24], T, { rim: s > 0 });
            inl(g, f);
          }
      },
      front(g, _T, mi) {
        if (L.evo < 2) return;
        for (const s of [-1, 1]) {
          g.strokeStyle = matTone(mi).d;
          g.lineWidth = 3.2;
          g.beginPath();
          g.moveTo(s * 8, Y(-13));
          g.lineTo(s * 14, Y(-40));
          g.stroke();
          const bp = new Path2D();
          bp.arc(s * 14, Y(-41), 4.4, 0, Math.PI * 2);
          celFill(g, bp, [s * 14 - 4.4, Y(-45.4), s * 14 + 4.4, Y(-36.6)], tones(YEL), { rim: false });
          inl(g, bp);
        }
      },
      cap(g, hx, hy, r, mi) {
        const sp = new Path2D();
        sp.moveTo(hx - 3.4, hy - r + 1.5);
        sp.lineTo(hx, hy - r - 9);
        sp.lineTo(hx + 3.4, hy - r + 1.5);
        sp.closePath();
        celFill(g, sp, [hx - 3.4, hy - r - 9, hx + 3.4, hy - r + 1.5], matTone(mi), { rim: false });
        inl(g, sp);
      },
    };
  },
  splash(Y, L) {
    const top = Y(-4);
    const p = new Path2D();
    p.moveTo(-26, 22);
    p.lineTo(-26, top);
    p.ellipse(0, top, 26, 7, 0, Math.PI, Math.PI * 2);
    p.lineTo(26, 22);
    p.closePath();
    return {
      path: p,
      box: [-26, top - 7, 26, 22],
      head: L.evo >= 2 ? [0, top - 13, 10] : [0, Y(-8), 11],
      orn: [-22, Y(-10)],
      eyes: [
        [-9, Y(7)],
        [9, Y(7)],
      ],
      emb: [0, Y(15.5)],
      back(g, _T, mi) {
        if (L.evo < 1) return;
        for (const s of [-1, 1]) {
          const x0 = s < 0 ? -38 : 25;
          const tp = new Path2D();
          rrectP(tp, x0, Y(0), 13, 22 - Y(0) + 3, 5);
          matFill(g, tp, [x0, Y(0), x0 + 13, 25], mi);
          inl(g, tp);
          const cp = new Path2D();
          cp.ellipse(x0 + 6.5, Y(0) + 2, 6.5, 2.6, 0, 0, Math.PI * 2);
          g.fillStyle = matTone(mi).h;
          g.fill(cp);
          inl(g, cp);
        }
      },
      front(g, T) {
        const tf = new Path2D();
        tf.ellipse(0, top, 26, 7, 0, 0, Math.PI * 2);
        g.fillStyle = T.h;
        g.fill(tf);
        inl(g, tf);
        if (L.evo < 2) return;
        // Water tank dome with ripple lines.
        const d = new Path2D();
        d.ellipse(0, top - 1, 18, 17, 0, Math.PI, Math.PI * 2);
        d.closePath();
        g.save();
        g.globalAlpha = 0.8;
        g.fillStyle = "#8BEAF5";
        g.fill(d);
        g.restore();
        g.save();
        g.clip(d);
        g.strokeStyle = "rgba(255,255,255,.9)";
        g.lineWidth = 1.6;
        for (const yy of [-5, -10]) {
          g.beginPath();
          for (let x = -18; x <= 18; x += 2) g.lineTo(x, top + yy + Math.sin(x * 0.55) * 1.4);
          g.stroke();
        }
        g.fillStyle = "rgba(255,255,255,.65)";
        g.beginPath();
        g.ellipse(-8, top - 11, 3, 5, -0.4, 0, Math.PI * 2);
        g.fill();
        g.restore();
        inl(g, d);
      },
      top(g) {
        if (L.evo < 4) return;
        // Halo.
        g.strokeStyle = DEEP;
        g.lineWidth = 7;
        g.beginPath();
        g.ellipse(0, Y(-42), 15, 4.6, 0, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = "#FFC93C";
        g.lineWidth = 4;
        g.stroke();
      },
    };
  },
  slow(Y, L) {
    const t = Y(-17);
    const p = new Path2D();
    p.moveTo(-22, 22);
    p.lineTo(-22, t + 7);
    p.lineTo(-15, t);
    p.lineTo(15, t);
    p.lineTo(22, t + 7);
    p.lineTo(22, 22);
    p.closePath();
    return {
      path: p,
      box: [-22, t, 22, 22],
      head: [0, Y(-21), 8.5],
      orn: [-19, Y(-15)],
      eyes: [
        [-8, Y(-7)],
        [8, Y(-7)],
      ],
      emb: null,
      back(g) {
        if (L.evo >= 4) wings(g, Y);
      },
      front(g) {
        roll(g, 0, Y(10), 10);
        if (L.evo >= 2) {
          g.strokeStyle = TAPE;
          g.lineWidth = 2.6;
          for (const s of [-1, 1]) {
            g.beginPath();
            g.moveTo(s * 28, Y(6) + 9);
            g.quadraticCurveTo(s * 33, 24, s * 27, 31);
            g.stroke();
          }
          for (const s of [-1, 1]) roll(g, s * 28, Y(6), 10);
        } else if (L.evo >= 1) for (const s of [-1, 1]) roll(g, s * 25, Y(9), 6.2);
      },
    };
  },
};

const BARREL_TONES = tones("#33466F");

function tube(g: G, x: number, y: number, len: number, w: number): void {
  const p = new Path2D();
  rrectP(p, x, y - w / 2, len, w, Math.min(2.5, w / 2));
  celFill(g, p, [x, y - w / 2, x + len, y + w / 2], BARREL_TONES, { rim: false });
  inl(g, p, 1.6);
}

/**
 * 10 barrels per type (every 10 steps), drawn pointing along +x from the head centre.
 * rapid: 1 → 2 → 3 → 4 gatling → spinning disc; splash: thick nozzle → shower head → twin hose → ring;
 * slow: 1 roll → 2 rolls → net launcher → honeycomb net.
 */
export function drawBarrels(g: G, type: TowerType, bar: number, r: number, MT: Tones): void {
  const x0 = r * 0.45;
  if (type === "rapid") {
    if (bar === 9) {
      tube(g, x0, 0, 10, 6);
      const d = new Path2D();
      d.arc(x0 + 16, 0, 7.5, 0, Math.PI * 2);
      celFill(g, d, [x0 + 8.5, -7.5, x0 + 23.5, 7.5], MT, { rim: false });
      inl(g, d);
      g.strokeStyle = DEEP;
      g.lineWidth = 1.6;
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3;
        g.moveTo(x0 + 16 - Math.cos(a) * 6, -Math.sin(a) * 6);
        g.lineTo(x0 + 16 + Math.cos(a) * 6, Math.sin(a) * 6);
      }
      g.stroke();
      return;
    }
    const n = [1, 1, 2, 2, 2, 3, 3, 3, 4][bar]!;
    const len = 15 + (bar % 3) * 3;
    const w = n >= 3 ? 4.4 : 5.2;
    const gap = w + 1.3;
    for (let i = 0; i < n; i++) tube(g, x0, (i - (n - 1) / 2) * gap, len, w);
    const cap = new Path2D();
    rrectP(cap, x0 + len - 4.5, (-n * gap) / 2, 4.5, n * gap, 1.5);
    g.fillStyle = MT.b;
    g.fill(cap);
    inl(g, cap, 1.6);
  } else if (type === "splash") {
    if (bar <= 2) tube(g, x0, 0, 12 + bar * 2, 11 + bar);
    else if (bar <= 5) {
      tube(g, x0, 0, 11, 8);
      const p = new Path2D();
      const e = bar - 3;
      p.moveTo(x0 + 10, -4);
      p.lineTo(x0 + 19, -9 - e);
      p.lineTo(x0 + 19, 9 + e);
      p.lineTo(x0 + 10, 4);
      p.closePath();
      celFill(g, p, [x0 + 10, -10 - e, x0 + 19, 10 + e], MT, { rim: false });
      inl(g, p);
      g.fillStyle = DEEP;
      for (let i = -1; i <= 1; i++) {
        circle(g, x0 + 19, i * 4, 1.2);
        g.fill();
      }
    } else if (bar <= 8) {
      for (const s of [-1, 1]) tube(g, x0, s * 4.3, 17 + (bar - 6) * 2, 5);
    } else {
      tube(g, x0, 0, 13, 8);
      g.strokeStyle = DEEP;
      g.lineWidth = 5.4;
      g.beginPath();
      g.arc(x0 + 19, 0, 6.5, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = MT.h;
      g.lineWidth = 3;
      g.stroke();
    }
  } else {
    if (bar <= 2) {
      tube(g, x0, 0, 11, 7);
      roll(g, x0 + 15, 0, 5 + bar);
    } else if (bar <= 5) {
      tube(g, x0, 0, 9, 8);
      for (const s of [-1, 1]) roll(g, x0 + 14, s * 5.4, 4.6 + (bar - 3) * 0.4);
    } else if (bar <= 8) {
      tube(g, x0, 0, 10, 7);
      // Net grows a little with the barrel so each of the three looks differs.
      const e = (bar - 6) * 1.5;
      const sq = new Path2D();
      sq.rect(x0 + 10, -7 - e, 13 + e, 14 + e * 2);
      g.fillStyle = "rgba(243,227,179,.4)";
      g.fill(sq);
      g.strokeStyle = TAPE;
      g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i <= 3; i++) {
        g.moveTo(x0 + 10 + (i * (13 + e)) / 3, -7 - e);
        g.lineTo(x0 + 10 + (i * (13 + e)) / 3, 7 + e);
        g.moveTo(x0 + 10, -7 - e + (i * (14 + e * 2)) / 3);
        g.lineTo(x0 + 23 + e, -7 - e + (i * (14 + e * 2)) / 3);
      }
      g.stroke();
      inl(g, sq, 1.6);
    } else {
      tube(g, x0, 0, 10, 7);
      const hx = new Path2D();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = x0 + 18 + Math.cos(a) * 8.5;
        const py = Math.sin(a) * 8.5;
        if (i) hx.lineTo(px, py);
        else hx.moveTo(px, py);
      }
      hx.closePath();
      celFill(g, hx, [x0 + 9.5, -8.5, x0 + 26.5, 8.5], tones(TAPE), { rim: false });
      inl(g, hx);
      g.strokeStyle = "rgba(150,110,40,.85)";
      g.lineWidth = 1.1;
      g.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        g.moveTo(x0 + 18 - Math.cos(a) * 7, -Math.sin(a) * 7);
        g.lineTo(x0 + 18 + Math.cos(a) * 7, Math.sin(a) * 7);
      }
      g.stroke();
    }
  }
}

export const ORN_NAMES = ["깃발 리본", "별", "렌즈", "톱니", "자석", "번개", "추", "깔때기", "눈꽃", "두 갈래"] as const;

/** 20 ornaments (every 5 steps) = 10 shapes × 2 colour sets. idx -1 draws nothing. */
export function drawOrn(g: G, idx: number, x: number, y: number, sc = 1): void {
  if (idx < 0) return;
  const kind = idx % 10;
  const t = tones(idx < 10 ? YEL : CYAN);
  g.save();
  g.translate(x, y);
  g.scale(sc, sc);
  g.lineJoin = "round";
  g.lineCap = "round";
  const P = new Path2D();
  if (kind === 0) {
    g.strokeStyle = DEEP;
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(-3, 9);
    g.lineTo(-3, -10);
    g.stroke();
    P.moveTo(-2, -10);
    P.lineTo(10, -6.5);
    P.lineTo(-2, -1.5);
    P.closePath();
  } else if (kind === 1) starP(P, 0, 0, 8, 3.6);
  else if (kind === 2) P.arc(0, 0, 7, 0, Math.PI * 2);
  else if (kind === 3) {
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 ? 5.4 : 7.6;
      if (i) P.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else P.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    P.closePath();
  } else if (kind === 4) {
    P.moveTo(-7, -7);
    P.lineTo(-2.5, -7);
    P.lineTo(-2.5, 1);
    P.arc(0, 1, 2.5, Math.PI, 0, true);
    P.lineTo(2.5, -7);
    P.lineTo(7, -7);
    P.lineTo(7, 1);
    P.arc(0, 1, 7, 0, Math.PI);
    P.closePath();
  } else if (kind === 5) {
    P.moveTo(2, -9);
    P.lineTo(-6, 1);
    P.lineTo(-0.5, 1);
    P.lineTo(-2.5, 9);
    P.lineTo(6, -2);
    P.lineTo(0.5, -2);
    P.closePath();
  } else if (kind === 6) {
    P.moveTo(-5, -2);
    P.lineTo(5, -2);
    P.lineTo(7.5, 8);
    P.lineTo(-7.5, 8);
    P.closePath();
    P.moveTo(3, -5);
    P.arc(0, -5, 3, 0, Math.PI * 2);
  } else if (kind === 7) {
    P.moveTo(-8, -7);
    P.lineTo(8, -7);
    P.lineTo(2, 2);
    P.lineTo(2, 8);
    P.lineTo(-2, 8);
    P.lineTo(-2, 2);
    P.closePath();
  } else if (kind === 8) {
    g.strokeStyle = DEEP;
    g.lineWidth = 5.2;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      g.moveTo(-Math.cos(a) * 8, -Math.sin(a) * 8);
      g.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
    }
    g.stroke();
    g.strokeStyle = t.h;
    g.lineWidth = 2.8;
    g.stroke();
    g.restore();
    return;
  } else {
    P.moveTo(-1.6, 9);
    P.lineTo(-1.6, 0);
    P.lineTo(-6.5, -5);
    P.lineTo(-6.5, -9);
    P.lineTo(-3.8, -9);
    P.lineTo(-3.8, -6);
    P.lineTo(0, -2.3);
    P.lineTo(3.8, -6);
    P.lineTo(3.8, -9);
    P.lineTo(6.5, -9);
    P.lineTo(6.5, -5);
    P.lineTo(1.6, 0);
    P.lineTo(1.6, 9);
    P.closePath();
  }
  celFill(g, P, [-8, -10, 9, 9], t, { rim: false });
  if (kind === 2) {
    g.fillStyle = "rgba(255,255,255,.75)";
    g.beginPath();
    g.ellipse(-2.4, -2.4, 2, 3, -0.6, 0, Math.PI * 2);
    g.fill();
  }
  inl(g, P);
  g.restore();
}

/** Body variant (every 25 steps): material bands 1~3 and a chest emblem, inside the silhouette. */
function bodyTrim(g: G, B: Body, L: Look, mi: number): void {
  const [x0, , x1, y1] = B.box;
  const n = 1 + (L.body % 3);
  g.save();
  g.clip(B.path);
  for (let i = 0; i < n; i++) {
    const y = y1 - 5 - i * 6.5;
    const p = new Path2D();
    p.rect(x0 - 2, y - 2.3, x1 - x0 + 4, 4.6);
    matFill(g, p, [x0, y - 2.3, x1, y + 2.3], mi);
  }
  g.restore();
  if (!B.emb) return;
  const [ex, ey] = B.emb;
  const k = L.body % 4;
  const p = new Path2D();
  if (k === 0) p.arc(ex, ey, 3.8, 0, Math.PI * 2);
  else if (k === 1) {
    p.moveTo(ex, ey - 4.6);
    p.lineTo(ex + 4.2, ey);
    p.lineTo(ex, ey + 4.6);
    p.lineTo(ex - 4.2, ey);
    p.closePath();
  } else if (k === 2) starP(p, ex, ey, 4.8, 2.2);
  else {
    p.moveTo(ex - 4.6, ey - 2.4);
    p.lineTo(ex, ey + 2);
    p.lineTo(ex + 4.6, ey - 2.4);
    p.lineTo(ex + 4.6, ey + 0.8);
    p.lineTo(ex, ey + 5.2);
    p.lineTo(ex - 4.6, ey + 0.8);
    p.closePath();
  }
  g.fillStyle = mi === 9 ? "#FFF1C9" : matTone(mi).h;
  g.fill(p);
  inl(g, p, 1.6);
}

/** Turret head: only this part (barrels) turns to the aim. */
function drawHead(g: G, B: Body, aim: number, L: Look, T: Tones, mi: number, recoil: boolean, type: TowerType): void {
  const [hx, hy, r] = B.head;
  const MT = mi === 9 ? tones(MAT_COLORS[9]) : matTone(mi);
  const behind = Math.sin(aim) < -0.15;
  const barrels = () => {
    g.save();
    g.translate(hx, hy);
    g.rotate(aim);
    if (recoil) g.translate(-3, 0);
    drawBarrels(g, type, L.bar, r, MT);
    g.restore();
  };
  if (behind) barrels();
  const hp = new Path2D();
  hp.arc(hx, hy, r, 0, Math.PI * 2);
  celFill(g, hp, [hx - r, hy - r, hx + r, hy + r], MT);
  inl(g, hp);
  const cp = new Path2D();
  cp.arc(hx - r * 0.08, hy - r * 0.12, r * 0.6, 0, Math.PI * 2);
  celFill(g, cp, [hx - r * 0.68, hy - r * 0.72, hx + r * 0.52, hy + r * 0.48], T, { rim: false });
  g.fillStyle = "rgba(255,255,255,.75)";
  g.beginPath();
  g.ellipse(hx - r * 0.36, hy - r * 0.44, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2);
  g.fill();
  B.cap?.(g, hx, hy, r, mi);
  if (!behind) barrels();
}

/** Every layer of one tower, before the merged outline. */
export function drawTowerBody(g: G, type: TowerType, step: number, pal: number, aim: number, recoil: boolean): void {
  const L = lookOf(step);
  const sz = sizeOf(step);
  const hm = L.evo >= 3 ? 1.15 : 1; // Evolution IV: 15% taller.
  const Y: Y = (y) => 22 - (22 - y) * hm;
  const T = bodyTones(pal);
  const mi = L.mat;
  g.save();
  g.translate(0, 30);
  g.scale(sz, sz);
  g.translate(0, -30);
  g.lineJoin = "round";
  g.lineCap = "round";
  const B = BODY[type](Y, L);
  B.back?.(g, T, mi);
  drawBase(g, mi);
  g.fillStyle = "rgba(6,16,42,.45)";
  g.beginPath();
  g.ellipse(0, 22, B.box[2] * 0.92, 3.4, 0, 0, Math.PI * 2);
  g.fill();
  celFill(g, B.path, B.box, T);
  bodyTrim(g, B, L, mi);
  inl(g, B.path);
  B.front?.(g, T, mi);
  eyes(g, B.eyes);
  drawOrn(g, L.orn, B.orn[0], B.orn[1]);
  drawHead(g, B, aim, L, T, mi, recoil, type);
  if (L.evo >= 3) crown(g, B.head[0], B.head[1] - B.head[2] - (type === "rapid" ? 7 : 0));
  B.top?.(g);
  g.restore();
}
