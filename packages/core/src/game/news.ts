// "지난 소식" (spec D24): what happened to my region while I was away for more than an hour.
// The device keeps how the region looked when it last saw it; the next visit compares that with the server's state.
import { WAVE_MS } from "./waves.ts";

/** Away longer than this (server time) brings the news; an hour or less does not. */
export const AWAY_MS = BigInt(3_600_000);

/** My region as seen at `atMs` (server time). Breaches are counted since the region began. */
export type RegionSeen = { region: string; atMs: bigint; waveStartMs: bigint; breaches: bigint; best: bigint; rank: number };

export type AwayNews = {
  /** Whole hours away. */
  hours: bigint;
  /** Waves held while away. */
  held: bigint;
  breaches: bigint;
  best: bigint;
  bestUp: bigint;
  rank: number;
  /** Places climbed (negative: dropped). */
  rankUp: number;
};

/** The news for a visit, or null: away an hour or less, another region, or numbers that went back (a new database). */
export function awayNews(before: RegionSeen, now: RegionSeen): AwayNews | null {
  if (before.region !== now.region) return null;
  const away = now.atMs - before.atMs;
  if (away <= AWAY_MS) return null;
  const waves = (now.waveStartMs - before.waveStartMs) / WAVE_MS;
  const breaches = now.breaches - before.breaches;
  if (waves < breaches || breaches < BigInt(0) || now.best < before.best) return null;
  return {
    hours: away / AWAY_MS,
    held: waves - breaches,
    breaches,
    best: now.best,
    bestUp: now.best - before.best,
    rank: now.rank,
    rankUp: before.rank - now.rank,
  };
}
