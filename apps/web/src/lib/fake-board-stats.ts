// National board numbers (spec "전국 상황판"), fake until the board API exists (T17). Same recipe as mockup B.
import { fakeRegionStats, hash, type RegionStats } from "./fake-region-stats";

/** Only regions where at least this many guardians solved problems today get a per-guardian rank (Q34). */
export const PER_RANK_MIN_SOLVERS = 3;

export type BoardRegion = RegionStats & {
  wave: number;
  /** Guardians who solved problems today. */
  solvers: number;
  /** Correct answers today. */
  today: number;
  /** Correct answers today per solver, or null under PER_RANK_MIN_SOLVERS solvers. */
  per: number | null;
  rankWave: number | null;
  rankPer: number | null;
};

export type BoardStats = {
  regions: Map<string, BoardRegion>;
  /** Region codes in rank order for each tab. */
  byWave: string[];
  byPer: string[];
};

export type MyRegionNumbers = {
  code: string;
  guardians: number;
  best: number;
  wave: number;
  online: number;
  today: number;
  solvers: number;
};

const byRank = (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);

export function fakeBoardStats(codes: string[], sidoOf: (code: string) => string, mine: MyRegionNumbers): BoardStats {
  const base = fakeRegionStats(codes, sidoOf, new Map([[mine.code, mine]]));
  const regions = new Map<string, BoardRegion>();
  for (const [code, s] of base) {
    const h = hash(code);
    const solvers = code === mine.code ? mine.solvers : Math.round(s.guardians * (0.28 + (h % 17) / 100));
    const today = code === mine.code ? mine.today : solvers * (22 + (h % 31));
    regions.set(code, {
      ...s,
      wave: code === mine.code ? mine.wave : s.guardians ? s.best - (h % 6) : 1,
      solvers,
      today,
      per: solvers >= PER_RANK_MIN_SOLVERS ? today / solvers : null,
      rankWave: null,
      rankPer: null,
    });
  }
  const all = [...regions.entries()];
  const byWave = all.filter(([, s]) => s.guardians > 0).map(([c, s]) => [c, s.best] as [string, number]).sort(byRank).map(([c]) => c);
  const byPer = all.filter(([, s]) => s.per !== null).map(([c, s]) => [c, s.per!] as [string, number]).sort(byRank).map(([c]) => c);
  byWave.forEach((c, i) => (regions.get(c)!.rankWave = i + 1));
  byPer.forEach((c, i) => (regions.get(c)!.rankPer = i + 1));
  return { regions, byWave, byPer };
}
