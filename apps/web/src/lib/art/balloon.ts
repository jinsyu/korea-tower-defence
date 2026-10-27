// Balloon enemies, ported from mockup B: size, shape, colour and attachments differ, not colour alone.
import { balloonHealthState, balloonScale, type BalloonKind } from "@ktd/core";
import { tones } from "./color";
import { CYAN, DEEP, RED, YEL } from "./palette";
import { celFill, circle, rrectP, type Box } from "./shapes";

type G = CanvasRenderingContext2D;

export const BALLOON_COLORS: Record<BalloonKind, string> = {
  normal: RED,
  fast: CYAN,
  king: "#FF9F1C",
  boss: "#E83F8F",
};

export type BalloonState = {
  /** Facing direction ±1. */
  dir?: 1 | -1;
  /** White hit flash frame. */
  flash?: boolean;
  /** Seconds since last hit ("> <" eyes under 0.25s). */
  hit?: number;
  /** Health ratio 0..1. */
  hp?: number;
  /** Slowed by tape (yellow X). */
  taped?: boolean;
  /** About to pop ("@ @" eyes). */
  near?: boolean;
  /** prefers-reduced-motion: no hit bounce. */
  reduced?: boolean;
};

/** Draw one balloon centred at (x, y). R0 = radius of a normal balloon in px. */
export function drawBalloon(g: G, x: number, y: number, R0: number, kind: BalloonKind, st: BalloonState = {}): void {
  const t = tones(BALLOON_COLORS[kind]);
  const dir = st.dir ?? 1;
  const hp = st.hp ?? 1;
  const health = balloonHealthState(kind, hp);
  const lw = Math.max(1.3, R0 * 0.17);
  const hit = st.hit ?? 9;
  g.save();
  g.translate(x, y);
  const bounce = hit < 0.12 && !st.reduced ? 1 + 0.15 * (1 - hit / 0.12) : 1;
  g.scale(bounce, bounce);
  g.lineJoin = "round";
  g.lineCap = "round";

  const parts: Path2D[] = [];
  const body = new Path2D();
  const R = R0 * balloonScale(kind);
  let box: Box;
  let eyeP: [number, number][];
  let crownPath: Path2D | null = null;

  if (kind === "boss") {
    // Horizontal blimp with tail fins and a gondola.
    const rx = R;
    const ry = R0 * 1.02;
    body.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    box = [-rx, -ry, rx, ry];
    const fin = new Path2D();
    const bx = -dir * rx * 0.78;
    for (const s of [-1, 1]) {
      fin.moveTo(bx, s * ry * 0.15);
      fin.lineTo(bx - dir * R0 * 0.8, s * ry * 1.1);
      fin.lineTo(bx - dir * R0 * 1.05, s * ry * 0.12);
      fin.closePath();
    }
    const gon = new Path2D();
    rrectP(gon, -R0 * 0.5, ry * 0.82, R0, R0 * 0.42, R0 * 0.15);
    parts.push(fin, gon);
    eyeP = [
      [dir * rx * 0.6, -ry * 0.12],
      [dir * rx * 0.32, -ry * 0.12],
    ];
  } else if (kind === "fast") {
    // Drop leaning 15° forward, with speed lines behind.
    g.rotate(dir * 0.26);
    g.scale(dir, 1);
    body.arc(R * 0.12, 0, R * 0.86, -Math.PI * 0.62, Math.PI * 0.62);
    body.lineTo(-R * 1.25, 0);
    body.closePath();
    box = [-R * 1.25, -R * 0.86, R * 0.98, R * 0.86];
    eyeP = [
      [R * 0.24, -R * 0.16],
      [R * 0.62, -R * 0.16],
    ];
    g.strokeStyle = "rgba(255,255,255,.75)";
    g.lineWidth = Math.max(1, R0 * 0.12);
    g.beginPath();
    for (const yy of [-0.42, 0, 0.42]) {
      g.moveTo(-R * 1.45, R * yy);
      g.lineTo(-R * 2.05, R * yy);
    }
    g.stroke();
  } else {
    const rx = R * 0.92;
    body.ellipse(0, 0, rx, R, 0, 0, Math.PI * 2);
    box = [-rx, -R, rx, R];
    const knot = new Path2D();
    knot.moveTo(-R * 0.16, R * 1.12);
    knot.lineTo(R * 0.16, R * 1.12);
    knot.lineTo(0, R * 0.92);
    knot.closePath();
    parts.push(knot);
    eyeP = [
      [-R * 0.3, -R * 0.06],
      [R * 0.3, -R * 0.06],
    ];
    g.strokeStyle = "rgba(255,255,255,.6)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, R * 1.12);
    g.quadraticCurveTo(R * 0.3, R * 1.5, 0, R * 1.9);
    g.stroke();
    if (kind === "king") {
      crownPath = new Path2D();
      const cy = -R * 0.86;
      crownPath.moveTo(-R * 0.36, cy);
      crownPath.lineTo(-R * 0.42, cy - R * 0.4);
      crownPath.lineTo(-R * 0.16, cy - R * 0.18);
      crownPath.lineTo(0, cy - R * 0.48);
      crownPath.lineTo(R * 0.16, cy - R * 0.18);
      crownPath.lineTo(R * 0.42, cy - R * 0.4);
      crownPath.lineTo(R * 0.36, cy);
      crownPath.closePath();
      parts.push(crownPath);
    }
  }
  parts.unshift(body);

  // Merged outline: halo and navy stroke under every part first, fills on top.
  g.strokeStyle = "rgba(255,255,255,.4)";
  g.lineWidth = lw * 2 + 2.4;
  for (const p of parts) g.stroke(p);
  g.strokeStyle = DEEP;
  g.lineWidth = lw * 2;
  for (const p of parts) g.stroke(p);
  celFill(g, body, box, t, { rimW: Math.max(1.2, R0 * 0.22) });
  for (const p of parts.slice(1)) {
    g.fillStyle = p === crownPath ? "#FFC93C" : kind === "boss" ? t.d : t.s;
    g.fill(p);
  }
  g.fillStyle = "rgba(255,255,255,.6)";
  g.beginPath();
  g.ellipse(box[0] * 0.42, box[1] * 0.42, Math.max(1.2, R0 * 0.2), Math.max(1.6, R0 * 0.32), -0.5, 0, Math.PI * 2);
  g.fill();

  if (kind === "king") drawKingBands(g, body, R, health.bandBroken);
  if (kind === "boss") drawBossDetails(g, body, box, R0, t.s, dir, hp, health.tapes);
  if (kind === "fast") {
    const goggles = new Path2D();
    rrectP(goggles, -R * 0.08, -R * 0.36, R * 0.92, R * 0.4, R * 0.12);
    g.fillStyle = DEEP;
    g.fill(goggles);
    for (const [ex, ey] of eyeP) {
      g.fillStyle = "#E9FDFF";
      circle(g, ex, ey, R * 0.19);
      g.fill();
    }
  }
  drawFace(g, eyeP, R0, hit, !!st.near);
  if (st.taped) {
    g.save();
    g.strokeStyle = DEEP;
    g.lineWidth = Math.max(3, R0 * 0.5) + 2;
    g.beginPath();
    g.moveTo(box[0] * 0.8, box[1] * 0.8);
    g.lineTo(box[2] * 0.8, box[3] * 0.8);
    g.moveTo(box[2] * 0.8, box[1] * 0.8);
    g.lineTo(box[0] * 0.8, box[3] * 0.8);
    g.stroke();
    g.strokeStyle = YEL;
    g.lineWidth = Math.max(3, R0 * 0.5);
    g.stroke();
    g.restore();
  }
  if (st.flash) {
    g.fillStyle = "#fff";
    for (const p of parts) g.fill(p);
  }
  g.restore();
}

/** Two rubber bands around the king; the lower one snaps at 50%. */
function drawKingBands(g: G, body: Path2D, R: number, broken: boolean): void {
  const band = "#A84E00";
  g.save();
  g.clip(body);
  g.strokeStyle = band;
  g.lineWidth = Math.max(1.4, R * 0.15);
  for (const [i, f] of [-0.18, 0.36].entries()) {
    const yv = R * f;
    g.beginPath();
    if (i === 1 && broken) {
      g.moveTo(-R, yv);
      g.quadraticCurveTo(-R * 0.4, yv + R * 0.16, -R * 0.12, yv + R * 0.08);
      g.moveTo(R * 0.2, yv + R * 0.12);
      g.quadraticCurveTo(R * 0.5, yv + R * 0.2, R, yv);
    } else {
      g.moveTo(-R, yv);
      g.quadraticCurveTo(0, yv + R * 0.22, R, yv);
    }
    g.stroke();
  }
  g.restore();
  if (!broken) return;
  g.strokeStyle = band;
  g.lineWidth = Math.max(1.2, R * 0.12);
  g.beginPath();
  g.moveTo(-R * 0.12, R * 0.44);
  g.lineTo(-R * 0.2, R * 0.7);
  g.moveTo(R * 0.2, R * 0.48);
  g.lineTo(R * 0.3, R * 0.74);
  g.stroke();
}

/** Boss: panel seams, captain hat, patch tapes (66% / 33%), wrinkles (33%) and a health bar. */
function drawBossDetails(
  g: G,
  body: Path2D,
  box: Box,
  R0: number,
  seam: string,
  dir: number,
  hp: number,
  tapes: number,
): void {
  const rx = box[2];
  const ry = box[3];
  g.save();
  g.clip(body);
  g.strokeStyle = seam;
  g.lineWidth = Math.max(1, R0 * 0.1);
  for (const f of [-0.35, 0.35]) {
    g.beginPath();
    g.ellipse(0, 0, rx * Math.abs(f) * 2, ry, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  const hx = dir * rx * 0.46;
  const hy = -ry * 0.92;
  const hat = new Path2D();
  rrectP(hat, hx - R0 * 0.55, hy - R0 * 0.42, R0 * 1.1, R0 * 0.46, R0 * 0.16);
  g.fillStyle = DEEP;
  g.fill(hat);
  g.fillStyle = YEL;
  g.fillRect(hx - R0 * 0.55, hy - R0 * 0.08, R0 * 1.1, R0 * 0.12);
  g.fillStyle = DEEP;
  g.fillRect(hx - R0 * 0.15 + dir * R0 * 0.25, hy - R0 * 0.02, R0 * 0.75, R0 * 0.14);
  const tape = (cx: number, cy: number, rot: number) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.fillStyle = "#F7E7C4";
    g.strokeStyle = DEEP;
    g.lineWidth = 1;
    for (const a of [0.7, -0.7]) {
      g.save();
      g.rotate(a);
      g.fillRect(-R0 * 0.55, -R0 * 0.15, R0 * 1.1, R0 * 0.3);
      g.strokeRect(-R0 * 0.55, -R0 * 0.15, R0 * 1.1, R0 * 0.3);
      g.restore();
    }
    g.restore();
  };
  if (tapes >= 1) tape(-dir * rx * 0.25, -ry * 0.1, 0);
  if (tapes >= 2) {
    tape(dir * rx * 0.05, ry * 0.45, 0.3);
    g.strokeStyle = DEEP;
    g.lineWidth = 1;
    g.beginPath();
    for (const xx of [-0.55, -0.1, 0.3]) {
      g.moveTo(rx * xx, ry * 0.62);
      g.quadraticCurveTo(rx * xx + R0 * 0.2, ry * 0.45, rx * xx + R0 * 0.4, ry * 0.62);
    }
    g.stroke();
  }
  const bw = rx * 1.3;
  const bh = Math.max(3, R0 * 0.3);
  const by = -ry - R0 * 0.75;
  g.fillStyle = DEEP;
  g.fillRect(-bw / 2 - 1, by - 1, bw + 2, bh + 2);
  g.fillStyle = hp > 0.33 ? "#FF5DA2" : RED;
  g.fillRect(-bw / 2, by, bw * Math.max(0, Math.min(1, hp)), bh);
}

/** Face: dots normally, "> <" right after a hit, "@ @" about to pop. Never scary or hurt. */
function drawFace(g: G, eyeP: [number, number][], R0: number, hit: number, near: boolean): void {
  const er = Math.max(1.1, R0 * 0.13);
  g.strokeStyle = DEEP;
  g.fillStyle = DEEP;
  g.lineWidth = Math.max(1, R0 * 0.1);
  eyeP.forEach(([ex, ey], i) => {
    if (hit < 0.25) {
      const s = i === 0 ? 1 : -1;
      g.beginPath();
      g.moveTo(ex - s * er, ey - er);
      g.lineTo(ex + s * er * 0.6, ey);
      g.lineTo(ex - s * er, ey + er);
      g.stroke();
    } else if (near) {
      g.beginPath();
      g.arc(ex, ey, er * 1.1, 0, Math.PI * 1.7);
      g.stroke();
      circle(g, ex, ey, er * 0.35);
      g.fill();
    } else {
      circle(g, ex, ey, er);
      g.fill();
    }
  });
}
