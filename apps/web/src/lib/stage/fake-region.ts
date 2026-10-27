// Fake region and guardians for the defence screen until the game server (T11–T13) sends them.
import { NICK_ADJECTIVES, NICK_NOUNS, TOWER_TYPES, type Guardian } from "@ktd/core";
import index from "../../../../../data/source/gojang/regions/20261001/index.json";
import { fakeBoardStats, type BoardStats } from "@/lib/fake-board-stats";
import type { Me } from "./me-store";
import { seededRng } from "./sim";

export type RegionHud = {
  name: string;
  guardians: number;
  online: number;
  wave: number;
  best: number;
  power: number;
  perSec: number;
  rank: number;
};

/** Region code of the Pyeongchang test stage, the fake "우리 지역" until the server knows mine (T11). */
export const FAKE_REGION_CODE = "32540";

/** Mockup B numbers for Pyeongchang. */
const MY_REGION = { name: "평창군", guardians: 4218, online: 1036, wave: 1284, best: 1290, power: 8.2e12, perSec: 38 };

const SIDO_OF = new Map(index.sigungu.map((r) => [r.code, r.sidoCode]));

/**
 * The fake national board (all 185 regions) both the board and the defence screen read, so my region's rank
 * is the same in both places. Mockup B: Pyeongchang solved 53,214 problems today with 1,290 guardians.
 */
export const FAKE_BOARD: BoardStats = fakeBoardStats([...SIDO_OF.keys()], (code) => SIDO_OF.get(code)!, {
  code: FAKE_REGION_CODE,
  ...MY_REGION,
  today: 53214,
  solvers: 1290,
});

export const FAKE_REGION: RegionHud = { ...MY_REGION, rank: FAKE_BOARD.regions.get(FAKE_REGION_CODE)!.rankWave! };

/** Mockup B "씩씩한 수달": level 23, step 47, 580 points toward the next step. */
export const FAKE_ME: Me = {
  id: "me",
  nick: "씩씩한 수달",
  tag: "0427",
  type: "rapid",
  step: 47,
  pal: 0,
  pts24: 640,
  joinedAt: 3000,
  band: "12",
  region: FAKE_REGION_CODE,
  stance: "bal",
  level: 23,
  xp: 7800,
  wallet: 580,
};

/** count guardians with seeded names, types and points; the top three get steps 512, 318 and 205 like the mockup. */
export function fakeGuardians(count: number, seed = 9001): Guardian[] {
  const r = seededRng(seed);
  const out: Guardian[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      id: `g${i}`,
      nick: `${NICK_ADJECTIVES[Math.floor(r() * NICK_ADJECTIVES.length)]} ${NICK_NOUNS[Math.floor(r() * NICK_NOUNS.length)]}`,
      tag: String(Math.floor(r() * 10000)).padStart(4, "0"),
      type: TOWER_TYPES[Math.floor(r() * TOWER_TYPES.length)]!,
      step: Math.round(1 + r() * 300),
      pal: Math.floor(r() * 12),
      // Most guardians earned little or nothing today; a few earned a lot.
      pts24: r() < 0.4 ? 0 : Math.round(Math.pow(r(), 6) * 4300),
      joinedAt: i,
    });
  }
  const top = [...out].sort((a, b) => b.pts24 - a.pts24);
  [512, 318, 205].forEach((step, i) => {
    if (top[i]) top[i].step = step;
  });
  return out;
}
