import { describe, expect, it } from "vitest";
import { AWAY_MS, awayNews, type RegionSeen } from "./news.ts";
import { changePower, newRegionWaves, settle, WAVE_MS, type RegionWaves } from "./waves.ts";

const B = BigInt;
const T0 = B(Date.parse("2026-10-27T06:00:00Z"));

const seen = (s: RegionWaves, atMs: bigint, rank: number, region = "11010"): RegionSeen => ({
  region,
  atMs,
  waveStartMs: s.waveStartMs,
  breaches: s.breaches,
  best: s.best,
  rank,
});

describe("지난 소식 (D24)", () => {
  // Power 20 blocks up to wave 9: the region cycles 5..10 and breaches every sixth wave.
  const start = changePower(newRegionWaves(T0), T0, B(20));
  const left = settle(start, T0 + B(30) * WAVE_MS + B(5000));

  it("shows nothing for an hour away or less, and the news from just over an hour", () => {
    const at = left.waveStartMs + B(5000);
    const back = (ms: bigint) => seen(settle(left, at + ms), at + ms, 7);
    expect(awayNews(seen(left, at, 9), back(AWAY_MS - B(1)))).toBeNull();
    expect(awayNews(seen(left, at, 9), back(AWAY_MS))).toBeNull();
    const news = awayNews(seen(left, at, 9), back(AWAY_MS + B(1)));
    expect(news).not.toBeNull();
    // Exactly 60 waves ended in the hour (+1 ms): held + breaches.
    expect(news!.held + news!.breaches).toBe(B(60));
    expect(news!.breaches).toBe(B(10));
    expect(news).toMatchObject({ hours: B(1), rank: 7, rankUp: 2, bestUp: B(0) });
  });

  it("counts held waves, breaches, the best wave going up and the rank going down", () => {
    const at = T0 + B(5000);
    const fresh = changePower(newRegionWaves(T0), T0, B(20));
    const later = at + B(14) * AWAY_MS;
    const now = settle(fresh, later);
    const news = awayNews(seen(fresh, at, 3), seen(now, later, 5))!;
    expect(news.hours).toBe(B(14));
    expect(news.held + news.breaches).toBe(B(14 * 60));
    expect(news.breaches).toBe(now.breaches);
    expect(news).toMatchObject({ best: B(9), bestUp: B(9), rank: 5, rankUp: -2 });
  });

  it("shows nothing after moving to another region or when the server's numbers went back", () => {
    const at = left.waveStartMs;
    const later = at + B(2) * AWAY_MS;
    const now = settle(left, later);
    expect(awayNews(seen(left, at, 1), seen(now, later, 1, "32540"))).toBeNull();
    expect(awayNews(seen(now, at, 1), seen(left, later, 1))).toBeNull();
  });
});
