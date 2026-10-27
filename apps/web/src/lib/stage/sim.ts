// Board simulation for the defence screen (mockup B StageView, without drawing).
// The wave result is decided outside (server from T13); this only stages it: on a held wave every balloon
// pops before the base, on a breach wave a few reach it. Juice is reported as events so tests can count it (D79).
import {
  pointAt,
  polyline,
  type BalloonKind,
  type BoardPoint,
  type Polyline,
  type StageFile,
  type TowerType,
} from "@ktd/core";

export type Rng = () => number;

/** xorshift32, as in the mockup. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export type ShakeCause = "boss-pop" | "wave-clear" | "breach";
export type BannerTone = "yellow" | "red" | "white" | "calm";

export type StageEvent =
  | { kind: "shake"; cause: ShakeCause; ampPx: number; ms: number }
  | { kind: "hitstop"; enemyId: number; balloon: BalloonKind; ms: number }
  | { kind: "flash"; cause: "hit" | "breach" }
  | { kind: "confetti"; cause: "pop" | "record" }
  | { kind: "light-pillar" }
  | { kind: "spotlight" }
  | { kind: "number"; text: string; mine: boolean }
  | { kind: "banner"; text: string; tone: BannerTone; ms: number }
  | { kind: "region"; wave: number; best: number };

export type Enemy = {
  id: number;
  /** Wave the balloon belongs to (the next wave's lead-in walks in before this one ends). */
  wave: number;
  kind: BalloonKind;
  path: number;
  d: number;
  speed: number;
  hp: number;
  maxHp: number;
  leak: boolean;
  flashAt: number;
  hitAt: number;
  tapedUntil: number;
  /** Boss hit-stop start (that balloon only). */
  dieAt: number | null;
};

export type SimTower = {
  spot: BoardPoint;
  type: TowerType;
  step: number;
  pal: number;
  me: boolean;
  cd: number;
  aim: number;
  firedAt: number;
  bounceAt: number;
  evoAt: number;
  evoFrom: number | null;
};

export type TowerInput = Pick<SimTower, "spot" | "type" | "step" | "pal" | "me">;

type SpawnItem = { t: number; path: number; kind: BalloonKind; wave: number; leak?: boolean };
type Shot = { x0: number; y0: number; enemyId: number; t0: number; dur: number; type: TowerType; big: boolean; pts: number };
type Shell = { enemyId: number; t0: number; dur: number; x: number };
type PopPart = { a: number; vx: number; vy: number; c: string; shard: boolean; r: number };
export type Fx =
  | { k: "stars"; p: BoardPoint; t: number; dur: number; n: number; seed: number }
  | { k: "splash" | "bigboom" | "upring" | "leak"; p: BoardPoint; t: number; dur: number }
  | { k: "pop"; p: BoardPoint; t: number; dur: number; big: boolean; parts: PopPart[] }
  | { k: "pang"; p: BoardPoint; t: number; dur: number; boss: boolean }
  | { k: "num"; p: BoardPoint; t: number; dur: number; text: string; jx: number };

export type RegionState = { wave: number; best: number; perSec: number };

export const SHAKE_MS = 150;
export const HITSTOP_MS = 50;
/** Tough enough that the board keeps several balloons in flight under full fire (mockup HP × 10, boss × 4). */
const ENEMY_HP: Record<BalloonKind, number> = { normal: 20, fast: 10, king: 40, boss: 56 };
const ANSWER_SHOT_DAMAGE = 20;
const TOWER_RATE: Record<TowerType, number> = { rapid: 0.45, splash: 1.0, slow: 0.8 };
const RANGE = 330;
/** Non-leak balloons always pop by this share of the path, so a held wave never reaches the base. */
export const HOLD_LIMIT = 0.86;
const BREACH_RESET_SEC = 1.7;
/** The first balloons of every wave are already this far along when the wave starts. */
const LEAD_SEC = 3;
/** A new screen opens mid-wave so balloons are already on the paths. */
const OPEN_AT_SEC = 8;
const POP_COLORS = ["#FFD60A", "#FFFFFF"];

export type SimOptions = {
  region: RegionState;
  rng: Rng;
  reduced: boolean;
  /** Wide screen: shake 4px, otherwise 2px. */
  wide: boolean;
  /** Turret head offset from the spot, in board units. */
  headOffset: (t: SimTower) => BoardPoint;
  balloonColor: (k: BalloonKind) => string;
};

export class StageSim {
  readonly paths: Polyline[];
  readonly region: RegionState;
  time = 0;
  waveT = 0;
  enemies: Enemy[] = [];
  towers: SimTower[] = [];
  emptyRepSpots: BoardPoint[] = [];
  shots: Shot[] = [];
  shells: Shell[] = [];
  fx: Fx[] = [];
  breach = false;
  baseHitAt = -9;
  spotAt = -9;
  shakeAt = -9;
  shakeAmp = 0;
  reduced: boolean;
  wide: boolean;
  private spawnQ: SpawnItem[] = [];
  private eid = 0;
  private shellAcc = 0;
  private breachDone = false;
  private resetAt: number | null = null;
  private readonly listeners = new Set<(e: StageEvent) => void>();

  constructor(
    readonly stage: StageFile,
    private readonly opts: SimOptions,
  ) {
    this.paths = stage.paths.map((p) => polyline(p.points));
    this.region = { ...opts.region };
    this.reduced = opts.reduced;
    this.wide = opts.wide;
    this.startWave(true);
  }

  on(listener: (e: StageEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(e: StageEvent) {
    this.listeners.forEach((l) => l(e));
  }

  private emitRegion() {
    this.emit({ kind: "region", wave: this.region.wave, best: this.region.best });
  }

  banner(text: string, tone: BannerTone, ms: number) {
    this.emit({ kind: "banner", text, tone, ms });
  }

  setTowers(list: TowerInput[]) {
    const r = this.opts.rng;
    const old = new Map(this.towers.map((t) => [`${t.spot[0]},${t.spot[1]}`, t]));
    // A tower that stays on its spot keeps its timers, so effects already running are not cut off.
    this.towers = list.map((t) => {
      const prev = old.get(`${t.spot[0]},${t.spot[1]}`);
      if (prev && prev.me === t.me) return { ...prev, ...t };
      return { ...t, cd: t.me ? 0.3 : r() * 0.6, aim: -Math.PI / 2, firedAt: -9, bounceAt: -9, evoAt: -9, evoFrom: null };
    });
    // Drawing order (top to bottom, the front tower covers the back one) and empty spots, kept until towers change.
    this.towers.sort((a, b) => a.spot[1] - b.spot[1]);
    const taken = new Set(this.towers.map((t) => `${t.spot[0]},${t.spot[1]}`));
    this.emptyRepSpots = this.stage.repSpots.filter((p) => !taken.has(`${p[0]},${p[1]}`));
  }

  myTower(): SimTower | undefined {
    return this.towers.find((t) => t.me);
  }

  enemyPos(e: Enemy): BoardPoint {
    return pointAt(this.paths[e.path]!, e.d);
  }

  headPos(t: SimTower): BoardPoint {
    const [hx, hy] = this.opts.headOffset(t);
    return [t.spot[0] + hx, t.spot[1] + hy];
  }

  /**
   * Regular spawns of wave W, times from its start. Mockup B density (5–7 per gate every 10 s) over the spawn
   * window; one that could not pop by the hold limit before the wave ends becomes a fast one or is left out.
   * The first LEAD_SEC of the next wave enter during the end of this one (negative times), so the board is never empty.
   */
  private schedule(W: number): SpawnItem[] {
    const { pace } = this.stage;
    const r = seededRng(W * 131 + 7);
    const lastStart = (kind: BalloonKind) => pace.waveSec - 0.3 - pace.travelSec[kind] * HOLD_LIMIT;
    const out: SpawnItem[] = [];
    this.paths.forEach((_, gi) => {
      const n = Math.round((5 + ((W + gi) % 3)) * (pace.spawnWindowSec / 10));
      for (let k = 0; k < n; k++) {
        const t = -LEAD_SEC + gi * 0.3 + (k * pace.spawnWindowSec) / n;
        let kind: BalloonKind = r() < 0.25 ? "fast" : r() < 0.2 ? "king" : "normal";
        if (t > lastStart(kind)) kind = "fast";
        if (t <= lastStart(kind)) out.push({ t, path: gi, kind, wave: W });
      }
    });
    return out;
  }

  /** Start the current wave; boss every 10th wave, three leaking kings on a breach wave. */
  startWave(first = false) {
    const { pace } = this.stage;
    const W = this.region.wave;
    this.breachDone = false;
    // The lead-in of this wave already entered during the previous one, except when the screen opens.
    const own = this.schedule(W).filter((q) => first || q.t >= 0);
    const next = this.breach ? [] : this.schedule(W + 1).filter((q) => q.t < 0).map((q) => ({ ...q, t: q.t + pace.waveSec }));
    this.spawnQ = [...own, ...next];
    if (W % 10 === 0) {
      this.spawnQ.push({ t: 3, path: 0, kind: "boss", wave: W });
      this.banner("속보! 대장 풍선 출현", "red", 1500);
    }
    if (this.breach) {
      for (let gi = 0; gi < Math.min(3, this.paths.length); gi++) {
        this.spawnQ.push({ t: 1 + gi * 0.6, path: gi, kind: "king", leak: true, wave: W });
      }
    }
    this.spawnQ.sort((a, b) => a.t - b.t);
    // A newly opened screen starts mid-wave: what was due by then is already part-way along the paths.
    const now = first ? OPEN_AT_SEC : 0;
    this.spawnQ = this.spawnQ.filter((q) => {
      if (q.t >= now) return true;
      this.spawn(q, now - q.t);
      return false;
    });
    this.waveT = now;
  }

  /** Last moment a balloon of this wave can still be on screen in a held wave (wave length check). */
  holdFinishSec(): number {
    const { pace } = this.stage;
    return Math.max(
      ...this.spawnQ.filter((q) => q.wave === this.region.wave).map((q) => q.t + pace.travelSec[q.kind] * HOLD_LIMIT),
      0,
    );
  }

  private spawn(q: SpawnItem, pre = 0) {
    const pa = this.paths[q.path];
    if (!pa) return;
    const sec = q.leak ? this.stage.pace.leakSec : this.stage.pace.travelSec[q.kind];
    const speed = pa.len / sec;
    const hp = ENEMY_HP[q.kind];
    this.enemies.push({
      id: ++this.eid,
      wave: q.wave,
      kind: q.kind,
      path: q.path,
      d: Math.min(pre * speed, pa.len * 0.8),
      speed,
      hp,
      maxHp: hp,
      leak: !!q.leak,
      flashAt: -9,
      hitAt: -9,
      tapedUntil: -9,
      dieAt: null,
    });
  }

  /** Screen shake only for boss pop, wave clear and base breach. */
  private shake(cause: ShakeCause) {
    if (this.reduced) return;
    this.shakeAt = this.time;
    this.shakeAmp = this.wide ? 4 : 2;
    this.emit({ kind: "shake", cause, ampPx: this.shakeAmp, ms: SHAKE_MS });
  }

  endWave() {
    const cleared = this.region.wave;
    this.enemies = this.enemies.filter((e) => e.wave > cleared);
    if (cleared > this.region.best) {
      this.region.best = cleared;
      this.banner(`속보: ${this.stage.name} 최고 웨이브 ${fmt(cleared)} 돌파!`, "red", 2200);
      if (!this.reduced) this.emit({ kind: "confetti", cause: "record" });
    } else {
      this.banner(`웨이브 ${fmt(cleared)} 방어!`, "white", 900);
    }
    this.shake("wave-clear");
    this.region.wave++;
    this.emitRegion();
    this.startWave();
  }

  /** Demo / server result: the coming wave breaks through. */
  startBreach() {
    this.breach = true;
    this.enemies = [];
    this.shots = [];
    this.startWave();
  }

  /** Demo: next wave is a boss wave. */
  jumpToBossWave() {
    this.region.wave = Math.ceil((this.region.wave + 1) / 10) * 10;
    this.enemies = [];
    this.emitRegion();
    this.startWave();
  }

  /** Demo: the current wave is a new best, cleared now. */
  clearAsRecord() {
    this.region.wave = this.region.best + 1;
    this.enemies = [];
    this.endWave();
  }

  setPerSec(n: number) {
    this.region.perSec = n;
  }

  private doBreach() {
    if (this.breachDone) return;
    this.breachDone = true;
    const to = Math.max(1, this.region.wave - 5);
    this.baseHitAt = this.time;
    this.fx.push({ k: "leak", p: this.stage.base, t: this.time, dur: 0.9 });
    if (!this.reduced) this.emit({ kind: "flash", cause: "breach" });
    this.shake("breach");
    this.banner(`방어선 재정비 — 웨이브 ${fmt(to)}부터 다시`, "calm", 2200);
    this.resetAt = this.time + BREACH_RESET_SEC;
  }

  private finishBreach() {
    this.resetAt = null;
    this.region.wave = Math.max(1, this.region.wave - 5);
    this.breach = false;
    this.enemies = [];
    this.shots = [];
    this.emitRegion();
    this.startWave();
  }

  /** Pop: rubber shards + confetti + ring; "펑!" for king and boss. Reduced motion: the balloon just goes. */
  private pop(e: Enemy) {
    if (e.kind === "boss") this.shake("boss-pop");
    if (this.reduced) return;
    const r = this.opts.rng;
    const p = this.enemyPos(e);
    const big = e.kind === "king" || e.kind === "boss";
    const col = this.opts.balloonColor(e.kind);
    const n = e.kind === "boss" ? 12 : big ? 9 : 6;
    const parts: PopPart[] = [];
    for (let i = 0; i < n + 3; i++) {
      const a = r() * Math.PI * 2;
      const v = (i < 3 ? 26 : 18 + r() * 26) * (e.kind === "boss" ? 1.5 : 1);
      parts.push({ a, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 12, c: i < 3 ? col : [col, ...POP_COLORS, col][i % 4]!, shard: i < 3, r: r() * 6 });
    }
    this.fx.push({ k: "pop", p, t: this.time, dur: 0.6, big, parts });
    this.emit({ kind: "confetti", cause: "pop" });
    if (big) this.fx.push({ k: "pang", p, t: this.time, dur: 0.58, boss: e.kind === "boss" });
  }

  private hit(e: Enemy, dmg: number) {
    if (!e.leak) e.hp -= dmg;
    e.hitAt = this.time;
    if (!this.reduced) {
      e.flashAt = this.time;
      this.emit({ kind: "flash", cause: "hit" });
    }
  }

  update(dt: number) {
    this.time += dt;
    this.waveT += dt;
    const r = this.opts.rng;
    while (this.spawnQ.length && this.spawnQ[0]!.t <= this.waveT) this.spawn(this.spawnQ.shift()!);
    for (const e of this.enemies) {
      if (e.dieAt != null) continue;
      e.d += e.speed * dt * (this.time < e.tapedUntil ? 0.6 : 1);
    }
    this.enemies = this.enemies.filter((e) => {
      const len = this.paths[e.path]!.len;
      if (e.leak) {
        if (e.d < len) return true;
        this.doBreach();
        return false;
      }
      if (e.dieAt != null) {
        if (this.time - e.dieAt < HITSTOP_MS / 1000) return true;
        this.pop(e);
        return false;
      }
      if (e.hp <= 0 && e.kind === "boss" && !this.reduced) {
        // Hit stop: this one balloon freezes for 50ms; the rest of the board keeps moving.
        e.dieAt = this.time;
        this.emit({ kind: "hitstop", enemyId: e.id, balloon: e.kind, ms: HITSTOP_MS });
        return true;
      }
      if (e.d >= len * HOLD_LIMIT || e.hp <= 0) {
        this.pop(e);
        return false;
      }
      return true;
    });

    for (const t of this.towers) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      let best: Enemy | null = null;
      let bd = Infinity;
      for (const e of this.enemies) {
        if (e.dieAt != null) continue;
        const p = this.enemyPos(e);
        const d = Math.hypot(p[0] - t.spot[0], p[1] - t.spot[1]);
        if (d < RANGE && d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) {
        t.cd = 0.2;
        continue;
      }
      const p = this.enemyPos(best);
      const [hx, hy] = this.headPos(t);
      t.aim = Math.atan2(p[1] - hy, p[0] - hx);
      t.firedAt = this.time;
      t.cd = TOWER_RATE[t.type] * (t.me ? 0.9 : 1);
      this.shots.push({ x0: hx, y0: hy, enemyId: best.id, t0: this.time, dur: t.type === "splash" ? 0.32 : t.type === "slow" ? 0.26 : 0.2, type: t.type, big: false, pts: 0 });
    }

    this.shots = this.shots.filter((s) => {
      if (this.time - s.t0 < s.dur) return true;
      const e = this.enemies.find((x) => x.id === s.enemyId);
      if (!e) return false;
      const p = this.enemyPos(e);
      this.hit(e, s.big ? ANSWER_SHOT_DAMAGE : 1);
      if (s.type === "slow") e.tapedUntil = this.time + 1.5;
      if (s.type === "splash") this.fx.push({ k: "splash", p, t: this.time, dur: 0.3 });
      this.fx.push({ k: "stars", p, t: this.time, dur: 0.2, n: s.big ? 2 : 1, seed: r() });
      if (s.big) {
        this.fx.push({ k: "bigboom", p, t: this.time, dur: 0.6 });
        // Floating numbers only for my own tower's answer shot.
        if (s.pts > 0) {
          const text = `+${s.pts}`;
          this.fx.push({ k: "num", p, t: this.time, dur: 0.6, text, jx: (r() - 0.5) * 16 });
          this.emit({ kind: "number", text, mine: true });
        }
      }
      return false;
    });

    // Cheer barrage: half the answers of the last second per second, at most 20 drawn.
    this.shellAcc += dt * Math.min(20, Math.max(1, this.region.perSec / 2));
    while (this.shellAcc >= 1) {
      this.shellAcc -= 1;
      const targets = this.enemies.filter((e) => !e.leak && e.dieAt == null);
      // Half the barrage goes for a boss when one is on the board, so it is shot down rather than waved through.
      const boss = targets.find((e) => e.kind === "boss");
      const e = boss && r() < 0.5 ? boss : targets.length ? targets[Math.floor(r() * targets.length)]! : null;
      if (e) this.shells.push({ enemyId: e.id, t0: this.time, dur: 0.5, x: this.enemyPos(e)[0] + (r() - 0.5) * 60 });
    }
    this.shells = this.shells.filter((s) => {
      if (this.time - s.t0 < s.dur) return true;
      const e = this.enemies.find((x) => x.id === s.enemyId);
      if (e) this.hit(e, 1);
      return false;
    });

    this.fx = this.fx.filter((f) => this.time - f.t < f.dur);
    if (this.resetAt != null && this.time >= this.resetAt) this.finishBreach();
    if (!this.breach && this.waveT >= this.stage.pace.waveSec) this.endWave();
  }

  /** Answer shot: my tower fires one big shell; only it shows a "+pts" number. */
  meFire(pts: number) {
    const t = this.myTower();
    if (!t) return;
    const [hx, hy] = this.headPos(t);
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of this.enemies) {
      if (e.leak || e.dieAt != null) continue;
      const p = this.enemyPos(e);
      const d = Math.hypot(p[0] - hx, p[1] - hy);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    t.firedAt = this.time;
    if (!best) return;
    const p = this.enemyPos(best);
    t.aim = Math.atan2(p[1] - hy, p[0] - hx);
    this.shots.push({ x0: hx, y0: hy, enemyId: best.id, t0: this.time, dur: 0.35, type: t.type, big: true, pts });
  }

  /** My tower changed step. kind: up (+1) / look (new decoration) / mat (material) / evo (evolution). */
  upgrade(kind: "up" | "look" | "mat" | "evo", toStep: number) {
    const t = this.myTower();
    if (!t) return;
    const from = t.step;
    t.step = toStep;
    t.bounceAt = this.time;
    this.fx.push({ k: "upring", p: t.spot, t: this.time, dur: 0.45 });
    if (this.reduced) return;
    if (kind === "look") {
      this.spotAt = this.time;
      this.emit({ kind: "spotlight" });
    }
    if (kind === "mat" || kind === "evo") {
      t.evoAt = this.time;
      t.evoFrom = from;
      this.emit({ kind: "light-pillar" });
    }
  }
}

export const fmt = (n: number): string => Math.round(n).toLocaleString("ko-KR");
