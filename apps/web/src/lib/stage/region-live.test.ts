import { WAVE_MS } from "@ktd/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hudOf, isStale, newsSince, rememberSeen, repGuardians, waveLine, type RegionMessage } from "./region-live";

afterEach(() => vi.unstubAllGlobals());

const HOUR = 3_600_000;
const W = Number(WAVE_MS);
const T0 = Date.parse("2026-10-27T06:00:00Z");

const msg = (over: Partial<RegionMessage> = {}): RegionMessage => ({
  code: "11010",
  now: T0 + 5000,
  rate: 1,
  wave: 12,
  waveStartMs: T0,
  held: true,
  power: "20",
  health: "1204",
  best: 9,
  breaches: 3,
  guardians: 2,
  online: 1,
  perSec: 0,
  rank: 4,
  ended: [],
  ...over,
});

function fakeStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
  });
}

describe("region from the server", () => {
  it("shows the power per second and the enemy as ⌈H ÷ 60⌉, so the power blocks when it is at least the enemy", () => {
    expect(hudOf(msg(), "종로구")).toMatchObject({ name: "종로구", wave: 12, best: 9, power: BigInt(20), enemy: BigInt(21), rank: 4 });
    expect(hudOf(msg({ health: "1200" }), "종로구").enemy).toBe(BigInt(20));
  });

  it("reads out every resolved wave as held, or breached with the wave it goes back to", () => {
    expect(waveLine({ wave: 12, held: true, startMs: 0 })).toBe("웨이브 12 막음");
    expect(waveLine({ wave: 13, held: false, startMs: 0 })).toBe("웨이브 13 뚫림 · 방어선 재정비, 웨이브 8부터 다시");
    expect(waveLine({ wave: 3, held: false, startMs: 0 })).toBe("웨이브 3 뚫림 · 방어선 재정비, 웨이브 1부터 다시");
  });

  it("drops a late message so it never overwrites a newer one", () => {
    expect(isStale(msg({ now: T0 }), msg({ now: T0 + 1000 }))).toBe(true);
    expect(isStale(msg({ now: T0 + 2000 }), msg({ now: T0 + 1000 }))).toBe(false);
    expect(isStale(msg({ now: T0, code: "32540" }), msg({ now: T0 + 1000 }))).toBe(false);
  });

  it("names the representatives from the word lists, in the server's order", () => {
    const g = repGuardians([{ rid: "r1", adj: 0, noun: 0, tag: 7, type: "rapid", step: 3, pal: 1, pts24: 50 }]);
    expect(g).toEqual([{ id: "r1", nick: "씩씩한 수달", tag: "0007", type: "rapid", step: 3, pal: 1, pts24: 50, joinedAt: 0 }]);
  });
});

describe("지난 소식 on the device (D24)", () => {
  it("shows nothing within the hour and the news from just over it", () => {
    fakeStorage();
    expect(newsSince(msg())).toBeNull();
    rememberSeen(msg());
    expect(newsSince(msg({ now: T0 + 5000 + HOUR }))).toBeNull();
    const later = msg({ now: T0 + 5001 + HOUR, waveStartMs: T0 + 60 * W, breaches: 13, best: 11, rank: 2 });
    expect(newsSince(later)).toEqual({ hours: 1, held: 50, breaches: 10, best: 11, bestUp: 2, rank: 2, rankUp: 2 });
  });

  it("shows nothing after a move to another region", () => {
    fakeStorage();
    rememberSeen(msg());
    expect(newsSince(msg({ code: "32540", now: T0 + 3 * HOUR }))).toBeNull();
  });
});
