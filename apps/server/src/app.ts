import { isRecoveryCode, type RecoveryCode } from "@ktd/core";
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { Server as SocketServer } from "socket.io";
import type { Config } from "./config";
import { HOUR_MS, kstDate } from "./dates";
import { createWriter, openDb, type Db } from "./db";
import { createGuardians, isNick, isTowerType, meView, nickCandidates, toLookChange } from "./guardians";
import { createAddressLimits } from "./limits";
import { isRoute, createLive, type Live } from "./live";
import { createMath } from "./math";
import { createPoints24 } from "./points24";
import { createRegions, POWER_POOL_MS, REGION_CODES } from "./regions";

export type GameServer = {
  httpServer: HttpServer;
  io: SocketServer;
  db: Db;
  live: Live;
  /** Hourly upkeep: 365-day clean-up, log and point trims, region power check, expired address entries. Also at start. */
  maintenance: () => Promise<void>;
  /** Apply the pooled region power changes now (runs every 10 s of server time). */
  flushPower: () => Promise<void>;
  close: () => Promise<void>;
};

export type GameServerOptions = {
  config: Config;
  /** Server clock (epoch ms). Tests swap it to cross the 24-hour, 30-day and 365-day lines. */
  now?: () => number;
  /** Server ms per real ms of `now` (the E2E fast clock); timers wait that much less. */
  rate?: number;
};

/** Engine.io heartbeat: a dead connection shows as closed within 2.5 s on the screen (D58: 3 s). */
const PING_INTERVAL_MS = 1000;
const PING_TIMEOUT_MS = 1500;

type Reply = { status: number; body?: unknown };
type Json = Record<string, unknown>;
type Guardian = NonNullable<ReturnType<ReturnType<typeof createGuardians>["byKey"]>>;

const MAX_BODY = 4096;
const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;
const bad: Reply = { status: 400, body: { error: "bad_request" } };

class TooLarge extends Error {}

async function readJson(req: IncomingMessage): Promise<Json> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new TooLarge();
    chunks.push(chunk);
  }
  if (size === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new SyntaxError("not an object");
  return parsed as Json;
}

/** Caddy puts the real client address last in X-Forwarded-For; the server only listens on 127.0.0.1. */
function clientAddress(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const last = (Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)?.split(",").at(-1)?.trim();
  return last || req.socket.remoteAddress || "unknown";
}

function toCode(body: Json): RecoveryCode | null {
  const { words, digits } = body;
  if (!Array.isArray(words) || words.length !== 4 || !words.every((w) => typeof w === "string") || typeof digits !== "string") {
    return null;
  }
  const code: RecoveryCode = { words: words as [string, string, string, string], digits };
  return isRecoveryCode(code) ? code : null;
}

export function createGameServer({ config, now = Date.now, rate = 1 }: GameServerOptions): GameServer {
  const db = openDb(config.dbPath);
  const writer = createWriter(db, config.flushMs);
  const regions = createRegions(db);
  const points24 = createPoints24(db);
  const guardians = createGuardians(db, regions, config.serverSecret);
  const math = createMath(db, regions, points24, (code) => live.countCorrect(code));
  const limits = createAddressLimits(config.ipHmacKey, now);

  const authed = (req: IncomingMessage): Guardian | undefined => {
    const key = req.headers.authorization?.match(/^Bearer (\S+)$/)?.[1];
    return key && KEY_SHAPE.test(key) ? guardians.byKey(key) : undefined;
  };

  /** Seen today: the last visit is kept as a day only, written once a day. */
  const seen = async (g: Guardian) => {
    if (g.last_seen_on !== kstDate(now())) await writer.run(() => guardians.touch(g.id, now()));
  };

  const me = (g: Guardian) => ({ me: meView(g, now(), points24.of(g.id, now())) });

  const locked = (msLeft: number): Reply => ({ status: 429, body: { error: "locked", minutesLeft: Math.ceil(msLeft / 60000) } });
  const wrongCode = (address: string): Reply => {
    const out = limits.restoreFailed(address);
    return out.locked ? locked(limits.restoreLockLeft(address)) : { status: 401, body: { error: "bad_code", triesLeft: out.triesLeft } };
  };

  const routes: Record<string, (req: IncomingMessage, body: Json) => Promise<Reply>> = {
    "GET /nicks": async () => ({ status: 200, body: { candidates: nickCandidates() } }),

    // Only the listed fields are read; points, stage, power or waves sent by a screen are ignored (D54).
    // replaceKey: this device's key of the guardian it made before, when the child went back from the code screen.
    "POST /guardians": async (req, body) => {
      const { region, nick, towerType, replaceKey } = body;
      if (typeof region !== "string" || !REGION_CODES.has(region) || !isNick(nick) || !isTowerType(towerType)) {
        return bad;
      }
      const address = clientAddress(req);
      if (!limits.canCreate(address)) return { status: 429, body: { error: "too_many_guardians" } };
      limits.created(address);
      const replaced = typeof replaceKey === "string" && KEY_SHAPE.test(replaceKey) ? replaceKey : null;
      const { made, removed } = await writer.run(() => ({
        removed: replaced ? guardians.removeUnusedByKey(replaced) : undefined,
        made: guardians.create({ region, nick, towerType }, now()),
      }));
      if (removed) io.in(`g:${removed}`).disconnectSockets(true);
      return { status: 201, body: { key: made.key, code: made.code, ...me(made.guardian) } };
    },

    // Lock check, code lookup and failure count run in one synchronous step, so concurrent tries from one
    // address are counted one after another and none can slip past a lock (D5).
    "POST /restore": async (req, body) => {
      const code = toCode(body);
      if (!code) return bad;
      const address = clientAddress(req);
      const lockLeft = limits.restoreLockLeft(address);
      if (lockLeft > 0) return locked(lockLeft);
      if (!guardians.codeExists(code)) return wrongCode(address);
      const found = await writer.run(() => guardians.restore(code, now()));
      // The guardian was deleted while this request waited for the write.
      if (!found) return wrongCode(address);
      return { status: 200, body: { key: found.key, ...me(found.guardian) } };
    },
  };

  const myRoutes: Record<string, (g: Guardian, body: Json) => Promise<Reply>> = {
    "GET /me": async (g) => {
      await seen(g);
      return { status: 200, body: me(g) };
    },
    "POST /me/nick": async (g, { nick }) => {
      if (!isNick(nick)) return bad;
      return { status: 200, body: me(await writer.run(() => guardians.setNick(g.id, nick))) };
    },
    // Type, tendency and colour from the my-tower screen. A level sent along is ignored: the colour lock uses the saved one.
    "POST /me/look": async (g, body) => {
      const change = toLookChange(body);
      if (!change) return bad;
      const out = await writer.run(() => guardians.setLook(g.id, change));
      if (!out.ok) return { status: 409, body: { error: out.reason } };
      return { status: 200, body: me(out.guardian) };
    },
    "POST /me/region": async (g, { region }) => {
      if (typeof region !== "string" || !REGION_CODES.has(region)) return bad;
      const out = await writer.run(() => guardians.changeRegion(g.id, region, now()));
      if (!out.ok) return { status: 409, body: out.reason === "locked" ? { error: "region_locked", nextOn: out.nextOn } : { error: "same_region" } };
      live.move(g.id, region);
      return { status: 200, body: me(out.guardian) };
    },
    "POST /me/code": async (g) => ({ status: 200, body: { code: await writer.run(() => guardians.newCode(g.id)) } }),
    // The open problem, made when there is none (D32). The answer stays on the server (D33).
    "GET /math/problem": async (g) => refusedOr(await writer.run(() => math.problem(g.id, now()))),
    // Only the problem id and the pick are read; points, level, time or "correct" sent by a screen are ignored (D54).
    // The time is taken when the request arrives, before it waits for the batched write.
    "POST /math/answer": async (g, { id, pick }) => {
      if (typeof id !== "string" || !Number.isInteger(pick) || (pick as number) < 0 || (pick as number) > 3) return bad;
      const at = now();
      return refusedOr(await writer.run(() => math.answer(g.id, id, pick as number, at)));
    },
    "POST /math/skip": async (g, { id }) => {
      if (typeof id !== "string") return bad;
      const at = now();
      return refusedOr(await writer.run(() => math.skip(g.id, id, at)));
    },
    "DELETE /me": async (g) => {
      await writer.run(() => guardians.remove(g.id));
      io.in(`g:${g.id}`).disconnectSockets(true);
      return { status: 204 };
    },
  };

  /** A guardian deleted while the request waited answers like an unknown key; a closed or foreign problem is a conflict. */
  function refusedOr(out: object): Reply {
    if ("error" in out) return out.error === "no_guardian" ? { status: 401, body: out } : { status: 409, body: out };
    return { status: 200, body: out };
  }

  const corsHeaders = {
    "access-control-allow-origin": config.allowedOrigin,
    "access-control-allow-methods": "GET, POST, DELETE",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "600",
    vary: "origin",
  };

  function send(res: ServerResponse, { status, body }: Reply, cors: boolean) {
    const headers: Record<string, string> = { "cache-control": "no-store", ...(cors ? corsHeaders : {}) };
    if (body === undefined) return res.writeHead(status, headers).end();
    res.writeHead(status, { ...headers, "content-type": "application/json" }).end(JSON.stringify(body));
  }

  async function handle(req: IncomingMessage): Promise<{ reply: Reply; cors: boolean }> {
    const path = new URL(req.url ?? "/", "http://server").pathname;
    // Numbers only: connections per route (spec 위험 요소 "학교망 차단": how many go through the paid proxy).
    if (req.method === "GET" && path === "/health") return { reply: { status: 200, body: { ok: true, ...live.health() } }, cors: false };
    const routeKey = `${req.method === "OPTIONS" ? req.headers["access-control-request-method"] : req.method} ${path}`;
    const open = routes[routeKey];
    const mine = myRoutes[routeKey];
    if (!open && !mine) return { reply: { status: 404 }, cors: false };
    // One allowed origin (spec "허용 Origin"). Requests without it are refused too.
    if (req.headers.origin !== config.allowedOrigin) return { reply: { status: 403, body: { error: "origin" } }, cors: false };
    if (req.method === "OPTIONS") return { reply: { status: 204 }, cors: true };
    let body: Json;
    try {
      body = await readJson(req);
    } catch (err) {
      return { reply: err instanceof TooLarge ? { status: 413 } : bad, cors: true };
    }
    if (open) return { reply: await open(req, body), cors: true };
    const g = authed(req);
    if (!g) return { reply: { status: 401, body: { error: "no_guardian" } }, cors: true };
    return { reply: await mine!(g, body), cors: true };
  }

  const httpServer = createServer((req, res) => {
    handle(req).then(
      ({ reply, cors }) => send(res, reply, cors),
      (err: unknown) => {
        // Only the error itself: no request data, so no nickname, key, code or address reaches the log.
        console.error("request failed:", err instanceof Error ? `${err.name}: ${err.message}` : "unknown error");
        send(res, { status: 500, body: { error: "server" } }, true);
      },
    );
  });

  const io = new SocketServer(httpServer, {
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
    cors: { origin: config.allowedOrigin },
    allowRequest: (req, done) => done(null, req.headers.origin === config.allowedOrigin),
  });

  // A socket belongs to the guardian of its device key; unknown or deleted keys are refused (D54).
  io.use((socket, next) => {
    const key: unknown = socket.handshake.auth?.key;
    const g = typeof key === "string" && KEY_SHAPE.test(key) ? guardians.byKey(key) : undefined;
    if (!g) return next(new Error("no_guardian"));
    socket.data.me = meView(g, now(), points24.of(g.id, now()));
    socket.data.gid = g.id;
    socket.data.region = g.region;
    // Which way the screen came (domain / IP path / web proxy), for the /health counts only.
    const route: unknown = socket.handshake.auth?.route;
    socket.data.route = isRoute(route) ? route : "domain";
    void socket.join(`g:${g.id}`);
    seen(g).then(
      () => next(),
      () => next(new Error("server")),
    );
  });
  const live = createLive({ io, writer, regions, points24, clock: { now, rate } });
  io.on("connection", (socket) => {
    socket.emit("me", socket.data.me);
    live.join(socket);
  });

  // After a restart the pooled power changes of the old process are gone: the region check puts them right (D57).
  const maintenance = () =>
    writer
      .run(() => {
        guardians.purgeInactive(now());
        regions.trimLog(now());
        points24.trim(now());
        regions.reconcile(guardians.regionTruth(), now());
      })
      .then(() => limits.sweep());

  const flushPower = () => writer.run(() => regions.applyPool(now()));
  const pooling = setInterval(() => {
    flushPower().catch((err: unknown) => console.error("power flush failed:", err instanceof Error ? err.message : err));
  }, POWER_POOL_MS / rate);
  pooling.unref();

  const upkeep = setInterval(() => {
    maintenance().catch((err: unknown) => console.error("maintenance failed:", err instanceof Error ? err.message : err));
  }, HOUR_MS / rate);
  upkeep.unref();

  const close = async () => {
    clearInterval(upkeep);
    clearInterval(pooling);
    live.close();
    limits.close();
    await new Promise<void>((resolve, reject) => io.close((err) => (err ? reject(err) : resolve())));
    // A clean stop keeps the pooled changes too.
    void writer.run(() => regions.applyPool(now()));
    writer.flush();
    db.close();
  };

  return { httpServer, io, db, live, maintenance, flushPower, close };
}
