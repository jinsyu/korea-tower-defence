// My guardian, kept in one store. The board's my tower, the "나" row of the representative list, the level bar
// and (T8) the my-guardian screen all read this one state, so they always show the same step (plan memo
// "같은 상태에서 그리기"). Growth numbers are fake until the growth rules (T10-2) and the server (T12).
import {
  boardTowers,
  EVO_NAMES,
  lookOf,
  MAT_NAMES,
  TIER_NAMES,
  type Guardian,
  type StageFile,
} from "@ktd/core";
import type { GradeBandId } from "@/lib/grade-bands";
import { FAKE_ME } from "./fake-region";
import type { BannerTone, TowerInput } from "./sim";

export type Me = Guardian & {
  band: GradeBandId;
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

/** The one store for this page session (fake guardian until the server sends mine, T11–T12). */
export const meStore = createMeStore(FAKE_ME);

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

const STAT_NAMES = ["힘", "빠르기", "멀리", "행운"] as const;

/** Level-up notice; with the balanced stance each level adds one point to the next stat in turn. */
export const levelUpText = (level: number): string => `레벨 ${level}! ${STAT_NAMES[(level - 2 + 4) % 4]} +1`;

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
