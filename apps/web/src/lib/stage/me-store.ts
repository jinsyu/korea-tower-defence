// My guardian, kept in one store. The board's my tower, the "나" row of the representative list, the level bar
// and (T8) the my-guardian screen all read this one state, so they always show the same step (plan memo
// "같은 상태에서 그리기"). From T11 the store starts from the server's guardian; growth moves with the server in T12.
import {
  boardTowers,
  EVO_NAMES,
  lookOf,
  nextLook,
  MAT_NAMES,
  TIER_NAMES,
  type Guardian,
  type NextLook,
  type StageFile,
  type Tendency,
  type TowerType,
} from "@ktd/core";
import type { ServerMe } from "@/lib/game-server";
import type { GradeBandId } from "@/lib/grade-bands";
import { FAKE_ME } from "./fake-region";
import type { BannerTone, TowerInput } from "./sim";

export const STAT_KEYS = ["pow", "spd", "rng", "luck"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export const STAT_NAMES: Record<StatKey, string> = { pow: "힘", spd: "빠르기", rng: "멀리", luck: "행운" };

/** How stat points are shared out: evenly, or one stat getting twice the others (spec "아이가 고르는 것"). */
export const STANCES = ["bal", ...STAT_KEYS] as const;
export type Stance = (typeof STANCES)[number];
export const STANCE_NAMES: Record<Stance, string> = { bal: "골고루", ...STAT_NAMES };

export type Me = Guardian & {
  band: GradeBandId;
  /** Region code I defend. */
  region: string;
  stance: Stance;
  level: number;
  /** Points ever earned; drives the level. */
  xp: number;
  /** Points not yet spent on tower steps. */
  wallet: number;
};

export type MeStore = {
  get: () => Me;
  set: (next: Me) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createMeStore(initial: Me): MeStore {
  let me = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => me,
    set: (next) => {
      me = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** The one store for this page session. Screens behind the guardian gate fill it from the server first. */
export const meStore = createMeStore(FAKE_ME);

const STANCE_OF: Record<Tendency, Stance> = { balanced: "bal", power: "pow", speed: "spd", range: "rng", luck: "luck" };

/** My guardian from the server, in the store's shape. Points in the last 24 hours arrive with the board (T12–T13). */
export function meFromServer(s: ServerMe): Me {
  return {
    id: "me",
    nick: s.name,
    tag: s.tag,
    type: s.towerType,
    step: Number(s.stage),
    pal: s.color,
    pts24: 0,
    joinedAt: 0,
    band: s.band,
    region: s.region,
    stance: STANCE_OF[s.tendency],
    level: Number(s.level),
    xp: Number(s.points),
    wallet: Number(s.wallet),
  };
}

/** Points needed in total to reach level n (fake curve from mockup B). */
export const needXP = (n: number): number => (n <= 1 ? 0 : Math.ceil(50 * Math.pow(n, 1.6)));
/** Points to go from step s to s + 1 (fake curve from mockup B). */
export const upCost = (s: number): number => Math.ceil(10 * Math.pow(s, 1.1));

export type UpgradeKind = "up" | "look" | "mat" | "evo";
export type UpgradeChange = { kind: UpgradeKind; text: string; tone: BannerTone; ms: number };

/** The biggest change between two steps decides the effect: evolution > material > new decoration > +1. */
export function upgradeChange(from: number, to: number): UpgradeChange | null {
  if (to <= from) return null;
  const a = lookOf(from);
  const b = lookOf(to);
  if (b.evo > a.evo) return { kind: "evo", text: `진화! ${EVO_NAMES[b.evo]} · ${MAT_NAMES[b.mat]} 타워`, tone: "red", ms: 2200 };
  if (b.mat > a.mat) {
    const tier = b.tier > a.tier ? ` · ${TIER_NAMES[b.tier]} 테두리` : "";
    return { kind: "mat", text: `${MAT_NAMES[b.mat]} 타워가 됐어요!${tier}`, tone: "yellow", ms: 2000 };
  }
  if (b.orn !== a.orn) return { kind: "look", text: `새 장식 공개! 내 타워 ${to}단계`, tone: "yellow", ms: 1800 };
  return { kind: "up", text: `내 타워 ${to}단계!`, tone: "yellow", ms: 1300 };
}

export type Stats = Record<StatKey, number>;

/**
 * One stat point per level after the first, shared by the stance: "bal" deals them out in turn, a one-stat stance
 * gives that stat 2 : 1 : 1 : 1 (mockup B; the real rule lands in core with T10-2). Changing the stance re-deals all.
 */
export function statsOf(level: number, stance: Stance): Stats {
  const pts = Math.max(0, level - 1);
  const out: Stats = { pow: 0, spd: 0, rng: 0, luck: 0 };
  if (stance === "bal") {
    for (let i = 0; i < pts; i++) out[STAT_KEYS[i % 4]!]++;
    return out;
  }
  out[stance] = Math.round((pts * 2) / 5);
  const rest = pts - out[stance];
  STAT_KEYS.filter((k) => k !== stance).forEach((k, i) => {
    out[k] = Math.floor(rest / 3) + (i < rest % 3 ? 1 : 0);
  });
  return out;
}

/** Level-up notice naming the stat that got the new point under my stance. */
export function levelUpText(level: number, stance: Stance): string {
  const now = statsOf(level, stance);
  const before = statsOf(level - 1, stance);
  const gained = STAT_KEYS.find((k) => now[k] > before[k]) ?? STAT_KEYS[0];
  return `레벨 ${level}! ${STAT_NAMES[gained]} +1`;
}

/** Colours open: one at the start and one more every 10 levels, 12 in all. */
export const openColors = (level: number): number => Math.min(12, 1 + Math.floor(level / 10));

// Choices on the my-guardian screen. They change the picture only, never the power (spec D47).
export const withType = (me: Me, type: TowerType): Me => ({ ...me, type });
export const withStance = (me: Me, stance: Stance): Me => ({ ...me, stance });
/** A locked colour is ignored. */
export const withPal = (me: Me, pal: number): Me => (pal >= 0 && pal < openColors(me.level) ? { ...me, pal } : me);

export type Gain = { me: Me; fromStep: number; fromLevel: number };

/** A correct answer: points go to xp and the wallet; levels and steps rise on their own (D48: several at once). */
export function gainPoints(me: Me, points: number): Gain {
  let { level, step, wallet } = me;
  const xp = me.xp + points;
  wallet += points;
  while (xp >= needXP(level + 1)) level++;
  while (wallet >= upCost(step)) {
    wallet -= upCost(step);
    step++;
  }
  return { me: { ...me, xp, wallet, level, step, pts24: me.pts24 + points }, fromStep: me.step, fromLevel: me.level };
}

// ---- Views. Every place that shows my guardian goes through these with the store's state. ----

/** Towers for the board: top N representatives on their spots, mine on my spot unless I am one of them. */
export function boardTowerInputs(stage: StageFile, guardians: readonly Guardian[], me: Me): TowerInput[] {
  return boardTowers(guardians, me, stage.repSpots.length).map(({ guardian: g, me: mine, ...at }) => ({
    spot: at.spot === "rep" ? stage.repSpots[at.index]! : stage.mySpot,
    type: g.type,
    step: g.step,
    pal: g.pal,
    me: mine,
  }));
}

export type RepRow = {
  id: string;
  /** 1-based rank, or null for my own row under the list. */
  rank: number | null;
  nick: string;
  tag: string;
  type: Guardian["type"];
  step: number;
  pal: number;
  pts24: number;
  me: boolean;
};

/** "오늘의 대표 지킴이": the representatives in order, then my row when I am not one of them. */
export function repRows(guardians: readonly Guardian[], me: Me, repSpotCount: number): RepRow[] {
  return boardTowers(guardians, me, repSpotCount).map((t) => ({
    id: t.guardian.id,
    rank: t.spot === "rep" ? t.index + 1 : null,
    nick: t.guardian.nick,
    tag: t.guardian.tag,
    type: t.guardian.type,
    step: t.guardian.step,
    pal: t.guardian.pal,
    pts24: t.guardian.pts24,
    me: t.me,
  }));
}

export type MeBarView = { level: number; levelPct: number; upgradePct: number; step: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Level and upgrade gauges under the problem panel. */
export function meBarView(me: Me): MeBarView {
  const l0 = needXP(me.level);
  const l1 = needXP(me.level + 1);
  return {
    level: me.level,
    levelPct: Math.floor(clamp01((me.xp - l0) / (l1 - l0)) * 100),
    upgradePct: Math.floor(clamp01(me.wallet / upCost(me.step)) * 100),
    step: me.step,
  };
}

/** Steps shown as "언젠가의 목표" on the my-guardian screen (mockup B: evolution, material and rim thresholds). */
export const PREVIEW_STEPS: readonly (readonly [number, string])[] = [
  [1, "I · 나무"],
  [10, "돌"],
  [25, "II · 철"],
  [50, "청동 · 초록 테"],
  [100, "III · 은 · 파랑 테"],
  [200, "IV · 금 · 보라 테"],
  [500, "V · 프리즘 · 금 테 ★"],
];

export type MeScreenView = {
  level: number;
  step: number;
  /** Points still needed for the next tower step / level. */
  toUpgrade: number;
  toLevel: number;
  upgradePct: number;
  /** Steps until the next decoration (every 5 steps). */
  toDecoration: number;
  stats: Stats;
  colorsOpen: number;
  previews: { step: number; label: string; now: boolean }[];
  next: NextLook | null;
};

export function meScreenView(me: Me): MeScreenView {
  const bar = meBarView(me);
  const reached = PREVIEW_STEPS.filter(([s]) => me.step >= s).at(-1)?.[0];
  return {
    level: me.level,
    step: me.step,
    toUpgrade: Math.max(0, upCost(me.step) - me.wallet),
    toLevel: Math.max(0, needXP(me.level + 1) - me.xp),
    upgradePct: bar.upgradePct,
    toDecoration: 5 - (me.step % 5),
    stats: statsOf(me.level, me.stance),
    colorsOpen: openColors(me.level),
    previews: PREVIEW_STEPS.map(([step, label]) => ({ step, label, now: step === reached })),
    next: nextLook(me.step),
  };
}
