// Board drawing (mockup B StageView.buildStatic / draw), browser only.
// Layer order: sea, neighbour land, our land, background roads, enemy paths, gates, spots, base, balloons, towers, shots, effects.
import { lookOf, pointAt, type BoardPoint, type BoardView, type StageFile } from "@ktd/core";
import { drawBalloon } from "@/lib/art/balloon";
import { asImage, ctx2d, makeCanvas, type ArtCanvas } from "@/lib/art/canvas";
import { CYAN, DEEP, NAVY, RED, TIER_COLORS, YEL } from "@/lib/art/palette";
import { setUnitPx } from "@/lib/art/shapes";
import { SPR_AX, SPR_AY, towerSprite } from "@/lib/art/sprite";
import { headUnit } from "@/lib/art/tower";
import type { Enemy, Fx, StageSim } from "./sim";

type G = CanvasRenderingContext2D;
export type ScreenView = BoardView & { dpr: number };
export type Fonts = { display: string; sans: string };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const easeOut = (p: number) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);
const SEA = "#08132B";

function P(v: BoardView, p: BoardPoint): BoardPoint {
  return [v.ox + p[0] * v.s, v.oy + p[1] * v.s];
}

function circle(g: G, x: number, y: number, r: number) {
  g.beginPath();
  g.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

function poly(g: G, pts: BoardPoint[]) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
}

function rrect(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function starPath(g: G, x: number, y: number, r1: number, r2: number, n = 5) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
}

/** Four-point sparkle. */
function spark(g: G, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y);
  g.quadraticCurveTo(x, y, x, y - r);
  g.closePath();
}

/** Screen centre of a balloon: exactly its path position, no bob or push (D16). */
export function balloonCenter(v: BoardView, sim: StageSim, e: Enemy): BoardPoint {
  return P(v, sim.enemyPos(e));
}

/** Reduced motion keeps only the floating number and the (static) breach ring. */
export function fxShown(kind: Fx["k"], reduced: boolean): boolean {
  return !reduced || kind === "num" || kind === "leak";
}

/** Breach ring at progress p: a widening wave, or a fixed red ring under reduced motion. */
export function leakRing(p: number, D: number, reduced: boolean): { r: number; width: number; alpha: number } {
  if (reduced) return { r: D * 0.75, width: 4, alpha: 0.9 };
  return { r: D * 0.4 + p * D * 0.9, width: 7 * (1 - p), alpha: 1 - p };
}

/** Everything that does not move, drawn once per size into an offscreen canvas. */
export function paintBackground(stage: StageFile, v: ScreenView): ArtCanvas {
  const c = makeCanvas(v.w * v.dpr, v.h * v.dpr);
  const g = ctx2d(c);
  g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
  const toPath = (polys: StageFile["region"]) => {
    const p = new Path2D();
    for (const pl of polys) {
      for (const ring of pl) {
        ring.forEach((pt, i) => {
          const [x, y] = P(v, pt);
          if (i) p.lineTo(x, y);
          else p.moveTo(x, y);
        });
        p.closePath();
      }
    }
    return p;
  };
  g.fillStyle = SEA;
  g.fillRect(0, 0, v.w, v.h);
  g.strokeStyle = "rgba(255,255,255,.045)";
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0.5; x < v.w; x += 24) {
    g.moveTo(x, 0);
    g.lineTo(x, v.h);
  }
  for (let y = 0.5; y < v.h; y += 24) {
    g.moveTo(0, y);
    g.lineTo(v.w, y);
  }
  g.stroke();
  for (const nb of stage.neighbors) {
    const p = toPath(nb.polygons);
    g.fillStyle = "#0F2147";
    g.fill(p, "evenodd");
    g.strokeStyle = "rgba(255,255,255,.14)";
    g.lineWidth = 1;
    g.stroke(p);
  }
  const land = toPath(stage.region);
  g.save();
  g.shadowColor = "rgba(255,214,10,.35)";
  g.shadowBlur = 22;
  g.fillStyle = "#16346B";
  g.fill(land, "evenodd");
  g.restore();
  g.save();
  g.clip(land, "evenodd");
  g.fillStyle = "rgba(255,255,255,.035)";
  for (let x = -v.h; x < v.w; x += 56) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 28, 0);
    g.lineTo(x + 28 + v.h, v.h);
    g.lineTo(x + v.h, v.h);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.lineJoin = "round";
  g.lineWidth = 2.2;
  g.strokeStyle = "#FFFFFF";
  g.stroke(land);
  for (const road of stage.backgroundRoads) {
    g.save();
    g.strokeStyle = "rgba(255,255,255,.22)";
    g.lineWidth = 2;
    g.lineCap = "round";
    g.lineJoin = "round";
    poly(g, road.map((p) => P(v, p)));
    g.stroke();
    g.restore();
  }
  const wd = clamp(26 * v.s, 9, 26);
  for (const pa of stage.paths) {
    const pts = pa.points.map((p) => P(v, p));
    g.save();
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "rgba(255,255,255,.75)";
    g.lineWidth = wd + 4;
    poly(g, pts);
    g.stroke();
    g.strokeStyle = "#070C1A";
    g.lineWidth = wd;
    poly(g, pts);
    g.stroke();
    g.strokeStyle = YEL;
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    poly(g, pts);
    g.stroke();
    g.restore();
  }
  // Gate doors: red square with a double chevron along the path.
  for (const pa of stage.paths) {
    const [x, y] = P(v, pa.points[0]!);
    const ahead = pa.points[Math.min(pa.points.length - 1, 4)]!;
    const [x2, y2] = P(v, ahead);
    const ang = Math.atan2(y2 - y, x2 - x);
    const r = clamp(24 * v.s, 11, 18);
    g.save();
    g.translate(x, y);
    g.fillStyle = RED;
    rrect(g, -r, -r, r * 2, r * 2, 4);
    g.fill();
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.stroke();
    g.rotate(ang);
    g.lineWidth = 3;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(-r * 0.5, -r * 0.45);
    g.lineTo(0, 0);
    g.lineTo(-r * 0.5, r * 0.45);
    g.moveTo(r * 0.05, -r * 0.45);
    g.lineTo(r * 0.5, 0);
    g.lineTo(r * 0.05, r * 0.45);
    g.stroke();
    g.restore();
  }
  return c;
}

/** Tier effect (50 steps up): sparkle → light ring → lightning → both → rainbow, phase-shifted per tower. */
function tierFx(g: G, x: number, y: number, D: number, tier: number, now: number, ph: number) {
  if (!tier) return;
  const u = D / 96;
  const gy = y + 32 * u;
  const t = now + ph;
  g.save();
  const ringFx = (col: string) => {
    const p = (t % 1.6) / 1.6;
    g.globalAlpha = 0.75 * (1 - p);
    g.strokeStyle = col;
    g.lineWidth = Math.max(1.5, 3 * u);
    g.beginPath();
    g.ellipse(x, gy, (40 + 8 * p) * u, (13 + 3 * p) * u, 0, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  };
  const bolt = () => {
    const p = t % 1.4;
    if (p > 0.18) return;
    g.strokeStyle = "#fff";
    g.lineWidth = Math.max(1.2, 2 * u);
    g.shadowColor = "#B26BFF";
    g.shadowBlur = 8;
    g.beginPath();
    const s = Math.floor(t / 1.4) % 2 ? 1 : -1;
    g.moveTo(x + s * 18 * u, y - 40 * u);
    g.lineTo(x + s * 28 * u, y - 26 * u);
    g.lineTo(x + s * 22 * u, y - 22 * u);
    g.lineTo(x + s * 34 * u, y - 6 * u);
    g.stroke();
    g.shadowBlur = 0;
  };
  if (tier === 1) {
    const p = (t % 2) / 2;
    if (p < 0.3) {
      const q = p / 0.3;
      const sx = x + (((Math.floor(t / 2) * 37) % 40) - 20) * u;
      const sy = y - (30 + q * 10) * u;
      g.globalAlpha = 1 - q;
      g.fillStyle = YEL;
      spark(g, sx, sy, (4 + 6 * Math.sin(q * Math.PI)) * u);
      g.fill();
    }
  } else if (tier === 2) ringFx(TIER_COLORS[2]);
  else if (tier === 3) bolt();
  else if (tier === 4) {
    ringFx(TIER_COLORS[4]);
    bolt();
  } else {
    g.lineWidth = Math.max(1.6, 3.4 * u);
    for (let i = 0; i < 12; i++) {
      g.strokeStyle = `hsl(${Math.round(i * 30 + t * 80) % 360} 95% 62%)`;
      g.beginPath();
      g.ellipse(x, gy, 42 * u, 14 * u, 0, (i * Math.PI) / 6, ((i + 1) * Math.PI) / 6);
      g.stroke();
    }
    const p = (t % 1.8) / 1.8;
    if (p < 0.25) {
      g.globalAlpha = 1 - p / 0.25;
      g.fillStyle = "#fff";
      spark(g, x + 22 * u, y - 36 * u, 7 * u);
      g.fill();
    }
  }
  g.restore();
}

/** My tower: yellow dashed ground ring + red "나" tag (unlike any tier border). */
function meMark(g: G, x: number, y: number, D: number, now: number, reduced: boolean, sans: string) {
  const u = D / 96;
  g.save();
  g.strokeStyle = YEL;
  g.lineWidth = Math.max(2, 3 * u);
  g.setLineDash([6, 4]);
  g.lineDashOffset = reduced ? 0 : -now * 20;
  g.beginPath();
  g.ellipse(x, y + 31 * u, 46 * u, 15 * u, 0, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  const fs = Math.max(10, Math.round(D * 0.22));
  g.font = `900 ${fs}px ${sans}`;
  g.fillStyle = RED;
  g.fillRect(x - D / 2, y - D / 2, fs * 1.5, fs + 3);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "top";
  g.fillText("나", x - D / 2 + fs * 0.75, y - D / 2 + 1.5);
  g.restore();
}

/** Stamp a baked sprite (device px) at a CSS-px position. */
function stamp(g: G, sp: ArtCanvas, x: number, y: number, dpr: number) {
  g.drawImage(asImage(sp), x, y, sp.width / dpr, sp.height / dpr);
}

export type FrameResult = { towersDrawn: number };

export function drawFrame(g: G, sim: StageSim, v: ScreenView, bg: ArtCanvas, fonts: Fonts): FrameResult {
  const now = sim.time;
  const { D, dpr } = v;
  const reduced = sim.reduced;
  const stage = sim.stage;
  g.setTransform(1, 0, 0, 1, 0, 0);
  // Shake: 150ms decaying jitter (boss pop, wave clear, base breach).
  let ox = 0;
  let oy = 0;
  const sk = now - sim.shakeAt;
  if (sk < 0.15 && !reduced) {
    const a = sim.shakeAmp * (1 - sk / 0.15);
    ox = Math.sin(now * 90) * a;
    oy = Math.cos(now * 77) * a * 0.6;
  }
  if (ox || oy) {
    g.fillStyle = SEA;
    g.fillRect(0, 0, v.w * dpr, v.h * dpr);
  }
  g.drawImage(asImage(bg), ox * dpr, oy * dpr);
  g.setTransform(dpr, 0, 0, dpr, ox * dpr, oy * dpr);
  setUnitPx(dpr);

  // Empty representative spots: corner brackets.
  for (const sp of sim.emptyRepSpots) {
    const [x, y] = P(v, sp);
    const hh = D / 2 - 3;
    const L = D * 0.22;
    g.save();
    g.translate(x, y);
    g.strokeStyle = "rgba(255,255,255,.6)";
    g.lineWidth = 2;
    g.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      g.moveTo(sx * hh, sy * hh - sy * L);
      g.lineTo(sx * hh, sy * hh);
      g.lineTo(sx * hh - sx * L, sy * hh);
    }
    g.stroke();
    g.restore();
  }

  // Base shield; shakes for 0.5s when breached.
  {
    const [x, y] = P(v, stage.base);
    const since = now - sim.baseHitAt;
    const sh = since < 0.5 && !reduced ? Math.sin(since * 60) * 5 * (1 - since / 0.5) : 0;
    const u = D * 0.5;
    g.save();
    g.translate(x + sh, y);
    g.shadowColor = "rgba(255,214,10,.6)";
    g.shadowBlur = 14;
    g.fillStyle = YEL;
    g.beginPath();
    g.moveTo(0, -u);
    g.lineTo(u * 0.85, -u * 0.6);
    g.lineTo(u * 0.7, u * 0.35);
    g.quadraticCurveTo(u * 0.4, u * 0.8, 0, u);
    g.quadraticCurveTo(-u * 0.4, u * 0.8, -u * 0.7, u * 0.35);
    g.lineTo(-u * 0.85, -u * 0.6);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = NAVY;
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = NAVY;
    starPath(g, 0, 0, u * 0.45, u * 0.2);
    g.fill();
    g.restore();
  }

  // Balloons face their direction and are drawn centred on the path (D16); a hit only bounces them 1.15×.
  const R0 = clamp(24 * v.s, 7, 18);
  for (const e of sim.enemies) {
    const pa = sim.paths[e.path]!;
    const p0 = sim.enemyPos(e);
    const p1 = pointAt(pa, e.d + 8);
    const [x, y] = balloonCenter(v, sim, e);
    const dir = p1[0] >= p0[0] ? 1 : -1;
    const hit = now - e.hitAt;
    const k = e.kind === "boss" ? 1.9 : e.kind === "king" ? 1.25 : e.kind === "fast" ? 0.8 : 1;
    g.fillStyle = "rgba(0,0,0,.28)";
    g.beginPath();
    g.ellipse(x, y + R0 * k * 1.5, R0 * k * 0.62, R0 * 0.2, 0, 0, Math.PI * 2);
    g.fill();
    drawBalloon(g, x, y, R0, e.kind, {
      dir,
      hit,
      flash: !reduced && now - e.flashAt < 0.05,
      hp: clamp(e.hp / e.maxHp, 0, 1),
      taped: now < e.tapedUntil,
      near: e.hp <= e.maxHp * 0.15,
      reduced,
    });
    if (e.leak) {
      // Breach balloons: white dashed ring.
      g.save();
      g.strokeStyle = "#fff";
      g.lineWidth = 2;
      g.setLineDash([4, 3]);
      circle(g, x, y, R0 * k * 1.2);
      g.stroke();
      g.restore();
    }
  }

  // Towers top to bottom so the front one covers the back one.
  // sim.towers is kept sorted top to bottom, so the front tower covers the back one.
  let drawn = 0;
  for (const [i, t] of sim.towers.entries()) {
    const [x, y] = P(v, t.spot);
    const since = now - t.firedAt;
    const recoil = since < 0.08 && !reduced;
    const gy = y + D * 0.3125;
    const ax = x - D * SPR_AX;
    const ay = y - D * SPR_AY;
    let scx = 1;
    let scy = 1;
    if (!reduced) {
      if (t.me && since < 0.1) {
        const q = Math.sin((since / 0.1) * Math.PI) * 0.06;
        scx += q;
        scy -= q;
      }
      const bs = now - t.bounceAt;
      if (bs < 0.4) {
        const q = bs / 0.4;
        const b = Math.sin(q * Math.PI * 2) * (1 - q) * 0.14;
        scx *= 1 - b * 0.5;
        scy *= 1 + b;
      }
    }
    const evoT = reduced ? 9 : now - t.evoAt;
    if (evoT < 1.2) {
      // Light pillar.
      const q = evoT / 1.2;
      const a = q < 0.2 ? q / 0.2 : 1 - (q - 0.2) / 0.8;
      const gr = g.createLinearGradient(0, y - D * 1.7, 0, gy);
      gr.addColorStop(0, "rgba(255,214,10,0)");
      gr.addColorStop(1, "rgba(255,214,10,.9)");
      g.save();
      g.globalAlpha = 0.6 * a;
      g.fillStyle = gr;
      g.fillRect(x - D * 0.34, y - D * 1.7, D * 0.68, gy - y + D * 1.7);
      g.restore();
    }
    const sp = towerSprite({ type: t.type, step: t.step, pal: t.pal, D, aim: t.aim, recoil, dpr, font: fonts.display });
    g.save();
    if (scx !== 1 || scy !== 1) {
      g.translate(x, gy);
      g.scale(scx, scy);
      g.translate(-x, -gy);
    }
    stamp(g, sp, ax, ay, dpr);
    g.restore();
    if (evoT < 0.5 && t.evoFrom != null) {
      const ws = towerSprite({ type: t.type, step: t.evoFrom, pal: t.pal, D, aim: t.aim, white: true, badge: false, dpr });
      g.save();
      g.globalAlpha = 1 - evoT / 0.5;
      stamp(g, ws, ax, ay, dpr);
      g.restore();
    }
    if (since < 0.06 && !reduced) {
      // Muzzle flash in the tower's colour family.
      const hu = headUnit(t.type, t.step);
      const u = D / 96;
      const aq = ((Math.round((t.aim / (Math.PI * 2)) * 24) / 24) * Math.PI * 2);
      const L = hu[2] + 22;
      const mx = x + (hu[0] + Math.cos(aq) * L) * u;
      const my = y + (hu[1] + Math.sin(aq) * L) * u;
      const r = Math.max(5, (t.type === "splash" ? 13 : 10) * u) * (1 - (since / 0.06) * 0.4);
      g.save();
      g.fillStyle = t.type === "rapid" ? YEL : t.type === "splash" ? "#E6FCFF" : "#FFF4C2";
      g.strokeStyle = DEEP;
      g.lineWidth = 1.5;
      spark(g, mx, my, r);
      g.stroke();
      g.fill();
      g.fillStyle = "#fff";
      circle(g, mx, my, r * 0.3);
      g.fill();
      g.restore();
    }
    if (!reduced) tierFx(g, x, y, D, lookOf(t.step).tier, now, i * 0.37);
    if (t.me) meMark(g, x, y, D, now, reduced, fonts.sans);
    drawn++;
  }

  // New look reveal: stage spotlight on my tower.
  if (now - sim.spotAt < 1.6 && !reduced) {
    const t = sim.myTower();
    if (t) {
      const [x, y] = P(v, t.spot);
      const p = (now - sim.spotAt) / 1.6;
      g.save();
      g.globalAlpha = 0.45 * (1 - p);
      g.fillStyle = YEL;
      g.beginPath();
      g.moveTo(x - D * 0.3, 0);
      g.lineTo(x + D * 0.3, 0);
      g.lineTo(x + D * 0.8, y + D * 0.5);
      g.lineTo(x - D * 0.8, y + D * 0.5);
      g.closePath();
      g.fill();
      g.restore();
    }
  }

  drawShots(g, sim, v, reduced);
  drawEffects(g, sim, v, fonts, reduced);
  return { towersDrawn: drawn };
}

/** Shots per tower family: rapid = yellow dart + 3 trail dots, splash = arcing droplet, slow = stretching tape; answer shot = big glowing shell. */
function drawShots(g: G, sim: StageSim, v: ScreenView, reduced: boolean) {
  const { D } = v;
  const now = sim.time;
  for (const s of sim.shots) {
    const e = sim.enemies.find((x) => x.id === s.enemyId);
    if (!e) continue;
    const p = clamp((now - s.t0) / s.dur, 0, 1);
    const [x0, y0] = P(v, [s.x0, s.y0]);
    const [x1, y1] = P(v, sim.enemyPos(e));
    const dx = x1 - x0;
    const dy = y1 - y0;
    const x = x0 + dx * p;
    let y = y0 + dy * p;
    g.save();
    g.lineJoin = "round";
    g.lineCap = "round";
    if (s.big) {
      g.strokeStyle = "rgba(255,214,10,.5)";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x, y);
      g.stroke();
      g.fillStyle = YEL;
      g.shadowColor = YEL;
      g.shadowBlur = reduced ? 0 : 18;
      circle(g, x, y, Math.max(6, D * 0.14));
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = DEEP;
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = "#fff";
      circle(g, x - D * 0.04, y - D * 0.04, Math.max(2, D * 0.045));
      g.fill();
    } else if (s.type === "rapid") {
      for (let k = 1; k <= 3; k++) {
        const q = Math.max(0, p - k * 0.09);
        g.globalAlpha = 0.6 - k * 0.15;
        g.fillStyle = YEL;
        circle(g, x0 + dx * q, y0 + dy * q, 2.4 - k * 0.5);
        g.fill();
      }
      g.globalAlpha = 1;
      g.translate(x, y);
      g.rotate(Math.atan2(dy, dx));
      g.fillStyle = DEEP;
      g.beginPath();
      g.moveTo(8, 0);
      g.lineTo(-6, -3.8);
      g.lineTo(-6, 3.8);
      g.closePath();
      g.fill();
      g.fillStyle = YEL;
      g.beginPath();
      g.moveTo(6, 0);
      g.lineTo(-4.5, -2.2);
      g.lineTo(-4.5, 2.2);
      g.closePath();
      g.fill();
    } else if (s.type === "splash") {
      const H = Math.min(42, Math.hypot(dx, dy) * 0.38);
      y -= Math.sin(p * Math.PI) * H;
      const ang = Math.atan2(dy - Math.cos(p * Math.PI) * Math.PI * H, dx);
      g.translate(x, y);
      g.rotate(ang);
      const dp = new Path2D();
      dp.arc(0, 0, 4.2, -Math.PI / 2, Math.PI / 2);
      dp.quadraticCurveTo(-4, 3.4, -10, 0);
      dp.quadraticCurveTo(-4, -3.4, 0, -4.2);
      dp.closePath();
      g.strokeStyle = DEEP;
      g.lineWidth = 3;
      g.stroke(dp);
      g.fillStyle = "#9BEFFA";
      g.fill(dp);
      g.fillStyle = "#fff";
      circle(g, 1, -1.6, 1.3);
      g.fill();
    } else {
      g.strokeStyle = DEEP;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x, y);
      g.stroke();
      g.strokeStyle = "#F3E3B3";
      g.lineWidth = 3.6;
      g.stroke();
      g.fillStyle = "#F3E3B3";
      g.strokeStyle = DEEP;
      g.lineWidth = 1.5;
      circle(g, x, y, 4.2);
      g.fill();
      g.stroke();
    }
    g.restore();
  }
  // Cheer barrage: cyan-tailed friendly shells falling from the sky.
  for (const s of sim.shells) {
    const e = sim.enemies.find((x) => x.id === s.enemyId);
    if (!e) continue;
    const p = clamp((now - s.t0) / s.dur, 0, 1);
    const [tx, ty] = P(v, sim.enemyPos(e));
    const sx = P(v, [s.x, 0])[0];
    const x = sx + (tx - sx) * p;
    const y = -10 + (ty + 10) * p;
    g.save();
    g.strokeStyle = "rgba(34,211,238,.45)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - (tx - sx) * 0.08, y - 26);
    g.stroke();
    g.fillStyle = CYAN;
    circle(g, x, y, 3.5);
    g.fill();
    g.restore();
  }
}

/** Effects. Reduced motion keeps only the floating number and the breach ring. */
function drawEffects(g: G, sim: StageSim, v: ScreenView, fonts: Fonts, reduced: boolean) {
  const { D } = v;
  const now = sim.time;
  const vk = clamp(D / 70, 0.6, 1.3);
  for (const f of sim.fx) {
    if (!fxShown(f.k, reduced)) continue;
    const p = clamp((now - f.t) / f.dur, 0, 1);
    const [x, y] = P(v, f.p);
    const a = 1 - p;
    g.save();
    g.globalAlpha = a;
    g.lineJoin = "round";
    g.lineCap = "round";
    switch (f.k) {
      case "stars":
        for (let i = 0; i < f.n * 2; i++) {
          const an = f.seed * 6.28 + i * 2.4;
          const d = 4 + easeOut(p) * 9;
          g.fillStyle = i % 2 ? "#fff" : YEL;
          spark(g, x + Math.cos(an) * d, y + Math.sin(an) * d, 4 * (1 - p * 0.5));
          g.fill();
        }
        break;
      case "splash": {
        const r = 6 + easeOut(p) * D * 0.34;
        g.strokeStyle = CYAN;
        g.lineWidth = 3 * a + 0.6;
        g.beginPath();
        g.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "#BFF6FF";
        for (let i = 0; i < 5; i++) {
          const an = -Math.PI * (0.15 + i * 0.175);
          const d = r * 0.8;
          circle(g, x + Math.cos(an) * d, y + Math.sin(an) * d * 0.7 - Math.sin(p * Math.PI) * 8, 2.2);
          g.fill();
        }
        break;
      }
      case "pop": {
        const tt = p * f.dur;
        if (p < 0.45) {
          const q = p / 0.45;
          g.globalAlpha = 1 - q;
          g.strokeStyle = "#fff";
          g.lineWidth = 3 * (1 - q) + 0.5;
          circle(g, x, y, (6 + q * (f.big ? 30 : 20)) * vk);
          g.stroke();
          g.globalAlpha = a;
        }
        for (const c of f.parts) {
          const px = x + c.vx * tt * 2.4 * vk;
          const py = y + (c.vy * tt * 2.4 + 110 * tt * tt) * vk;
          g.fillStyle = c.c;
          g.save();
          g.translate(px, py);
          if (c.shard) {
            g.rotate(c.a + tt * 6);
            g.strokeStyle = DEEP;
            g.lineWidth = 1;
            const sh = new Path2D();
            sh.moveTo(-5 * vk, 0);
            sh.quadraticCurveTo(0, -5 * vk, 5 * vk, 0);
            sh.quadraticCurveTo(0, -2 * vk, -5 * vk, 0);
            g.fill(sh);
            g.stroke(sh);
          } else {
            g.rotate(c.r + tt * 9);
            g.fillRect(-2.2 * vk, -1.3 * vk, 4.4 * vk, 2.6 * vk);
          }
          g.restore();
        }
        break;
      }
      case "pang": {
        const q = p * f.dur;
        const sc = q < 0.12 ? 0.6 + (q / 0.12) * 0.6 : q < 0.22 ? 1.2 - ((q - 0.12) / 0.1) * 0.2 : 1;
        const fs = clamp(D * 0.36, 16, 32) * (f.boss ? 1.35 : 1);
        g.globalAlpha = p > 0.65 ? 1 - (p - 0.65) / 0.35 : 1;
        g.translate(x, y - D * 0.35);
        g.scale(sc, sc);
        g.rotate(-0.08);
        g.font = `${Math.round(fs)}px ${fonts.display}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.strokeStyle = DEEP;
        g.lineWidth = fs * 0.24;
        g.strokeText("펑!", 0, 0);
        g.fillStyle = f.boss ? "#FF5DA2" : YEL;
        g.fillText("펑!", 0, 0);
        break;
      }
      case "num": {
        const fs = clamp(D * 0.3, 14, 26);
        const yy = y - D * 0.3 - (reduced ? 0 : easeOut(p) * 24);
        g.globalAlpha = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
        g.font = `900 ${Math.round(fs)}px ${fonts.sans}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.strokeStyle = DEEP;
        g.lineWidth = 4;
        g.strokeText(f.text, x + f.jx, yy);
        g.fillStyle = YEL;
        g.fillText(f.text, x + f.jx, yy);
        break;
      }
      case "bigboom": {
        const r = 10 + easeOut(p) * D * 0.6;
        g.strokeStyle = YEL;
        g.lineWidth = 5 * a + 1;
        circle(g, x, y, r);
        g.stroke();
        g.strokeStyle = "#fff";
        g.lineWidth = 2.5;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const an = (i / 8) * Math.PI * 2 + 0.2;
          g.moveTo(x + Math.cos(an) * r * 0.55, y + Math.sin(an) * r * 0.55);
          g.lineTo(x + Math.cos(an) * r * 0.85, y + Math.sin(an) * r * 0.85);
        }
        g.stroke();
        break;
      }
      case "upring": {
        const gy = y + D * 0.3125;
        const q = easeOut(p);
        g.strokeStyle = YEL;
        g.lineWidth = 4 * a + 1;
        g.beginPath();
        g.ellipse(x, gy, D * (0.42 + q * 0.3), D * (0.14 + q * 0.1), 0, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = YEL;
        for (let i = 0; i < 3; i++) {
          spark(g, x + (i - 1) * D * 0.3, gy - D * (0.3 + q * 0.5) - (i % 2) * D * 0.1, D * 0.06 * a + 1);
          g.fill();
        }
        break;
      }
      case "leak": {
        const ring = leakRing(p, D, reduced);
        g.globalAlpha = ring.alpha;
        g.strokeStyle = RED;
        g.lineWidth = ring.width;
        circle(g, x, y, ring.r);
        g.stroke();
        break;
      }
    }
    g.restore();
  }
}
