// Placeholder numbers until the national board API exists (T17). Same recipe as mockup B: a hash of the region code.

export type RegionStats = {
  guardians: number;
  best: number;
  online: number;
  /** Best-wave band 0..4 (quintiles of guarded regions), -1 when nobody guards the region. */
  band: number;
};

/** "지금 N명 지키는 중" on the first screen (mockup B value). */
export const FAKE_NATION_ONLINE = 48210;

const BIG_CITY_SIDO = new Set(["11", "21", "22", "23", "24", "25", "26", "31"]);

export function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** `overrides` replace a region's numbers before the bands are cut (my region shows the defence screen's numbers). */
export function fakeRegionStats(
  codes: string[],
  sidoOf: (code: string) => string,
  overrides?: ReadonlyMap<string, Omit<RegionStats, "band">>,
): Map<string, RegionStats> {
  const stats = new Map<string, RegionStats>();
  for (const code of codes) {
    const h = hash(code);
    let guardians = BIG_CITY_SIDO.has(sidoOf(code)) ? 3000 + (h % 26000) : 250 + (h % 6200);
    if (h % 53 === 7) guardians = 0;
    const best = guardians ? Math.round(900 + 110 * Math.log10(guardians) + (h % 97)) : 0;
    const online = Math.round(guardians * (0.1 + (h % 20) / 100));
    stats.set(code, { guardians, best, online, ...overrides?.get(code), band: -1 });
  }

  const bests = [...stats.values()].filter((s) => s.guardians).map((s) => s.best).sort((a, b) => a - b);
  const cuts = [0.2, 0.4, 0.6, 0.8].map((q) => bests[Math.floor(bests.length * q)]!);
  for (const s of stats.values()) {
    if (s.guardians) s.band = cuts.filter((c) => s.best >= c).length;
  }
  return stats;
}

export const BAND_COLORS = ["#1B3F86", "#2E6BD1", "#22D3EE", "#9BE15D", "#FFD60A"] as const;
export const NO_GUARDIAN_COLOR = "#2a3352";

export function bandColor(s: RegionStats): string {
  return s.band < 0 ? NO_GUARDIAN_COLOR : BAND_COLORS[s.band]!;
}
