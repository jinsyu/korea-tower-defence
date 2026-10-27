// Region rooms (spec "지역 방", "화면 연출과 서버 결과 맞추기", "대표 자리"; D21~D23, D25, D77).
// Each watched region has one tick a second (real time), set just after its wave boundaries so every ended wave goes
// out with the tick right after it. A tick settles and stores the region and sends one message when something changed:
// at most one region message a second per room, whatever the number of answers.
import { blocksWave, pickRepresentatives, waveHealth, type TowerType } from "@ktd/core";
import type { Server as SocketServer, Socket } from "socket.io";
import type { Clock } from "./clock";
import type { Writer } from "./db";
import { publicId } from "./guardians";
import type { Points24 } from "./points24";
import type { EndedWave, RegionRecord, Regions } from "./regions";

/** How the screen reached the server (spec "연결 순서"): counted on /health. */
export const ROUTES = ["domain", "ip", "proxy"] as const;
export type Route = (typeof ROUTES)[number];
export const isRoute = (v: unknown): v is Route => ROUTES.includes(v as Route);

/** The most representative spots a stage has (spec 6~14); the screen takes as many as its stage has. */
export const MAX_REP_SPOTS = 14;
/** Representatives are picked again this often (server time, spec "10분마다"). */
export const REPS_EVERY_MS = 10 * 60_000;
/** A tick runs this long (real time) after a wave boundary. */
const TICK_AFTER_BOUNDARY_MS = 50;

export type RegionMessage = {
  code: string;
  /** Server time this was made, and server ms per real ms (1 except in E2E). */
  now: number;
  rate: number;
  wave: number;
  waveStartMs: number;
  /** The wave in progress will be held (its power × T ≥ H). Known when it starts (D19). */
  held: boolean;
  /** Power P of the wave in progress and the enemy health H(w), decimal strings (BigInt). */
  power: string;
  health: string;
  best: number;
  /** Breaches since the region began. */
  breaches: number;
  guardians: number;
  /** Guardians watching now. */
  online: number;
  /** Right answers in the region during the last second. */
  perSec: number;
  /** Place by best wave among all regions. */
  rank: number;
  /** Waves resolved since the last message, oldest first. */
  ended: EndedWave[];
};

export type RepEntry = { rid: string; adj: number; noun: number; tag: number; type: string; step: number; pal: number; pts24: number };
export type RepsMessage = { code: string; list: RepEntry[] };

type Deps = { io: SocketServer; writer: Writer; regions: Regions; points24: Points24; clock: Clock };

const mod = (a: number, p: number) => ((a % p) + p) % p;

export type Live = ReturnType<typeof createLive>;

export function createLive({ io, writer, regions, points24, clock }: Deps) {
  /** Region → guardian id → open sockets. */
  const viewers = new Map<string, Map<string, number>>();
  const routes: Record<Route, number> = { domain: 0, ip: 0, proxy: 0 };
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const correct = new Map<string, number>();
  const perSecOf = new Map<string, number>();
  const lastSent = new Map<string, string>();
  const reps = new Map<string, { until: number; message: RepsMessage; json: string }>();
  let rankCache: { atReal: number; rankOf: (best: bigint) => number } | null = null;

  const room = (code: string) => `region:${code}`;

  /** Ranks are worked out at most once a real second for all rooms together. */
  function rankOf(best: bigint): number {
    const real = Date.now();
    if (!rankCache || real - rankCache.atReal >= 1000) rankCache = { atReal: real, rankOf: regions.ranks(clock.now()) };
    return rankCache.rankOf(best);
  }

  function message(code: string, rec: RegionRecord, ended: EndedWave[]): RegionMessage {
    return {
      code,
      now: clock.now(),
      rate: clock.rate,
      wave: Number(rec.wave),
      waveStartMs: Number(rec.waveStartMs),
      held: blocksWave(rec.power, rec.wave),
      power: rec.power.toString(),
      health: waveHealth(rec.wave).toString(),
      best: Number(rec.best),
      breaches: Number(rec.breaches),
      guardians: rec.guardianCount,
      online: viewers.get(code)?.size ?? 0,
      perSec: perSecOf.get(code) ?? 0,
      rank: rankOf(rec.best),
      ended,
    };
  }

  /** What a message says apart from its time and ended waves: a tick sends only when this changed or waves ended. */
  const signature = (m: RegionMessage) => JSON.stringify([m.wave, m.waveStartMs, m.power, m.best, m.breaches, m.guardians, m.online, m.perSec, m.rank]);

  /** Top representatives by points in the last 24 hours; picked again once the last pick is 10 minutes old (D21). */
  function repsOf(code: string, now: number): { message: RepsMessage; changed: boolean } {
    const cached = reps.get(code);
    if (cached && now < cached.until) return { message: cached.message, changed: false };
    const rows = points24.candidates(code, now);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const picked = pickRepresentatives(
      rows.map((r, joinedAt) => ({ id: r.id, nick: "", tag: "", type: r.tower_type as TowerType, step: r.stage, pal: r.color, pts24: r.pts24, joinedAt })),
      MAX_REP_SPOTS,
    );
    const list = picked.map((g): RepEntry => {
      const r = byId.get(g.id)!;
      return { rid: publicId(r.id), adj: r.nick_adj, noun: r.nick_noun, tag: r.nick_tag, type: r.tower_type, step: r.stage, pal: r.color, pts24: r.pts24 };
    });
    const json = JSON.stringify(list);
    const message = { code, list };
    reps.set(code, { until: now + REPS_EVERY_MS, message, json });
    return { message, changed: json !== cached?.json };
  }

  /** Next tick: one real second after the last, lined up just after the region's wave boundaries. */
  function schedule(code: string, waveStartMs: number) {
    if (timers.has(code) || !viewers.has(code)) return;
    const period = 1000 * clock.rate;
    const t = clock.now();
    const next = t + period - mod(t - (waveStartMs + TICK_AFTER_BOUNDARY_MS * clock.rate), period);
    const delay = Math.max(1, (next - t) / clock.rate);
    timers.set(
      code,
      setTimeout(() => {
        timers.delete(code);
        tick(code).catch((err: unknown) => {
          console.error("region tick failed:", err instanceof Error ? err.message : "unknown error");
          schedule(code, waveStartMs);
        });
      }, delay),
    );
  }

  async function tick(code: string): Promise<void> {
    if (!viewers.has(code)) return;
    await writer.run(() => regions.save(code, clock.now()));
    if (!viewers.has(code)) return;
    // State, ended waves and counts are taken together after the write, with nothing awaited in between.
    perSecOf.set(code, correct.get(code) ?? 0);
    correct.set(code, 0);
    const rec = regions.settled(code, clock.now());
    const msg = message(code, rec, regions.takeEnded(code));
    const sig = signature(msg);
    if (msg.ended.length > 0 || sig !== lastSent.get(code)) {
      io.to(room(code)).emit("region", msg);
      lastSent.set(code, sig);
    }
    const r = repsOf(code, clock.now());
    if (r.changed) io.to(room(code)).emit("reps", r.message);
    schedule(code, msg.waveStartMs);
  }

  function enter(socket: Socket, code: string) {
    const gid = socket.data.gid as string;
    void socket.join(room(code));
    let ids = viewers.get(code);
    if (!ids) {
      ids = new Map();
      viewers.set(code, ids);
      regions.watch(code, clock.now());
    }
    ids.set(gid, (ids.get(gid) ?? 0) + 1);
    // The newcomer gets the state at once (D23: the wave within 2 seconds) and the current representatives.
    const rec = regions.settled(code, clock.now());
    socket.emit("region", message(code, rec, []));
    const r = repsOf(code, clock.now());
    if (r.changed) io.to(room(code)).emit("reps", r.message);
    else socket.emit("reps", r.message);
    schedule(code, Number(rec.waveStartMs));
  }

  function leave(socket: Socket, code: string) {
    void socket.leave(room(code));
    const ids = viewers.get(code);
    if (!ids) return;
    const gid = socket.data.gid as string;
    const n = (ids.get(gid) ?? 1) - 1;
    if (n > 0) ids.set(gid, n);
    else ids.delete(gid);
    if (ids.size > 0) return;
    viewers.delete(code);
    regions.unwatch(code);
    clearTimeout(timers.get(code));
    timers.delete(code);
    lastSent.delete(code);
    correct.delete(code);
  }

  /** A connected socket of a guardian (socket.data: gid, region, route). */
  function join(socket: Socket) {
    const route = socket.data.route as Route;
    routes[route] += 1;
    enter(socket, socket.data.region as string);
    socket.on("disconnect", () => {
      routes[route] -= 1;
      leave(socket, socket.data.region as string);
    });
  }

  /** My region changed: my open sockets move to the new room. */
  function move(gid: string, to: string) {
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.gid !== gid || socket.data.region === to) continue;
      leave(socket, socket.data.region as string);
      socket.data.region = to;
      enter(socket, to);
    }
  }

  return {
    join,
    move,
    /** A right answer in the region (counted only while someone watches it). */
    countCorrect: (code: string) => void (viewers.has(code) && correct.set(code, (correct.get(code) ?? 0) + 1)),
    health: () => ({ sockets: { ...routes } }),
    /** Tests: run every watched region's tick now. */
    tickAll: async () => {
      const codes = [...viewers.keys()];
      codes.forEach((c) => {
        clearTimeout(timers.get(c));
        timers.delete(c);
      });
      await Promise.all(codes.map(tick));
    },
    close: () => {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}
