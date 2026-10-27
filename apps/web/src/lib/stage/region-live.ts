// My region from the game server (T13): the room messages, how the screen shows them, and "지난 소식".
import { awayNews, WAVE_SECONDS, NICK_ADJECTIVES, NICK_NOUNS, type Guardian, type RegionSeen, type TowerType } from "@ktd/core";
import type { AwayNews } from "@/components/stage/news-sheet";
import type { RegionHud } from "./fake-region";
import { fmt } from "./sim";

/** One resolved wave. `startMs` is when it started (server time). */
export type EndedWave = { wave: number; held: boolean; startMs: number };

/** apps/server/src/live.ts RegionMessage. */
export type RegionMessage = {
  code: string;
  now: number;
  rate: number;
  wave: number;
  waveStartMs: number;
  held: boolean;
  power: string;
  health: string;
  best: number;
  breaches: number;
  guardians: number;
  online: number;
  perSec: number;
  rank: number;
  ended: EndedWave[];
};

export type RepEntry = { rid: string; adj: number; noun: number; tag: number; type: string; step: number; pal: number; pts24: number };
export type RepsMessage = { code: string; list: RepEntry[] };

/** Scoreboard numbers before the first message: the name only. */
export const waitingHud = (name: string): RegionHud => ({
  name,
  guardians: 0,
  online: 0,
  wave: 0,
  best: 0,
  power: BigInt(0),
  enemy: BigInt(0),
  perSec: 0,
  rank: 0,
});

/** The scoreboard for a message. The enemy is shown per second like the power: P blocks the wave when P ≥ ⌈H ÷ 60⌉. */
export function hudOf(m: RegionMessage, name: string): RegionHud {
  const health = BigInt(m.health);
  return {
    name,
    guardians: m.guardians,
    online: m.online,
    wave: m.wave,
    best: m.best,
    power: BigInt(m.power),
    enemy: (health + WAVE_SECONDS - BigInt(1)) / WAVE_SECONDS,
    perSec: m.perSec,
    rank: m.rank,
  };
}

/** The representatives in the server's order, as board guardians (my entry is matched by my public id). */
export const repGuardians = (list: readonly RepEntry[]): Guardian[] =>
  list.map((r, joinedAt) => ({
    id: r.rid,
    nick: `${NICK_ADJECTIVES[r.adj] ?? ""} ${NICK_NOUNS[r.noun] ?? ""}`,
    tag: String(r.tag).padStart(4, "0"),
    type: r.type as TowerType,
    step: r.step,
    pal: r.pal,
    pts24: r.pts24,
    joinedAt,
  }));

/** The line read out for each resolved wave ("막음" / "방어선 재정비", D23). */
export function waveLine(e: EndedWave): string {
  if (e.held) return `웨이브 ${fmt(e.wave)} 막음`;
  return `웨이브 ${fmt(e.wave)} 뚫림 · 방어선 재정비, 웨이브 ${fmt(Math.max(1, e.wave - 5))}부터 다시`;
}

/** Whether a message is older than the one already shown (it must not overwrite it). */
export const isStale = (m: RegionMessage, shown: RegionMessage | null): boolean => !!shown && shown.code === m.code && m.now < shown.now;

// "지난 소식" (D24): the device keeps how my region looked when it last saw it. Region numbers and a time only;
// nothing about me (spec "기기에 저장": the device key and screen settings, plus this).
const SEEN_KEY = "ktd.v1.regionSeen";

type StoredSeen = { region: string; atMs: number; waveStartMs: number; breaches: number; best: number; rank: number };

const seenOf = (m: RegionMessage): StoredSeen => ({
  region: m.code,
  atMs: m.now,
  waveStartMs: m.waveStartMs,
  breaches: m.breaches,
  best: m.best,
  rank: m.rank,
});

const toCore = (s: StoredSeen): RegionSeen => ({
  region: s.region,
  atMs: BigInt(s.atMs),
  waveStartMs: BigInt(s.waveStartMs),
  breaches: BigInt(s.breaches),
  best: BigInt(s.best),
  rank: s.rank,
});

function readSeen(): StoredSeen | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const s = raw ? (JSON.parse(raw) as StoredSeen) : null;
    return s && typeof s.region === "string" && [s.atMs, s.waveStartMs, s.breaches, s.best, s.rank].every(Number.isSafeInteger) ? s : null;
  } catch {
    return null;
  }
}

export function rememberSeen(m: RegionMessage): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seenOf(m)));
  } catch {
    // Storage unavailable: no news next time.
  }
}

/** The news for the first message of a visit, from what this device saw last (null: an hour or less, or nothing). */
export function newsSince(m: RegionMessage): AwayNews | null {
  const before = readSeen();
  const news = before && awayNews(toCore(before), toCore(seenOf(m)));
  if (!news) return null;
  return {
    hours: Number(news.hours),
    held: Number(news.held),
    breaches: Number(news.breaches),
    best: Number(news.best),
    bestUp: Number(news.bestUp),
    rank: news.rank,
    rankUp: news.rankUp,
  };
}
