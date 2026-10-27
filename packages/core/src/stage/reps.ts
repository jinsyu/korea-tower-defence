// Which towers the board draws (spec "대표 자리", "내 자리"): the top N guardians by points earned in the last
// 24 hours sit on the N representative spots; my tower is always drawn, on my spot unless I am a representative.
// However many guardians a region has, at most N + 1 towers are drawn.
import type { TowerType } from "../looks.ts";

export type Guardian = {
  id: string;
  nick: string;
  tag: string;
  type: TowerType;
  step: number;
  pal: number;
  /** Points earned in the last 24 hours. */
  pts24: number;
  /** Join order; earlier wins a tie. */
  joinedAt: number;
};

/** Top n by pts24 (then higher step, then earlier join). Guardians with no points in 24 hours never qualify. */
export function pickRepresentatives(guardians: readonly Guardian[], n: number): Guardian[] {
  return guardians
    .filter((g) => g.pts24 > 0)
    .sort((a, b) => b.pts24 - a.pts24 || b.step - a.step || a.joinedAt - b.joinedAt)
    .slice(0, n);
}

export type BoardTower = { guardian: Guardian; me: boolean } & ({ spot: "rep"; index: number } | { spot: "mine" });

export function boardTowers(guardians: readonly Guardian[], me: Guardian, repSpotCount: number): BoardTower[] {
  const others = guardians.filter((g) => g.id !== me.id);
  return placeTowers(pickRepresentatives([...others, me], repSpotCount), me, repSpotCount);
}

/**
 * Towers for representatives already picked in order (the server's list, T13): the first n take the spots, my
 * entry is drawn with my own (newer) tower, and I stand on my spot when I am not among them.
 */
export function placeTowers(reps: readonly Guardian[], me: Guardian, repSpotCount: number): BoardTower[] {
  const towers: BoardTower[] = reps.slice(0, repSpotCount).map((g, index) => {
    const mine = g.id === me.id;
    return { guardian: mine ? { ...me, pts24: g.pts24 } : g, me: mine, spot: "rep", index };
  });
  if (!towers.some((t) => t.me)) towers.push({ guardian: me, me: true, spot: "mine" });
  return towers;
}
