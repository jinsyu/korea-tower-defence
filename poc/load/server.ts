// Minimal game server for the load PoC (T1). Not the real server: no anti-cheat, no daily caps.
// What it keeps from the real design: socket.io rooms per region, guardian state in memory,
// answers written in one SQLite transaction every FLUSH_MS before the ack (D57),
// region power batched every 10 s, one broadcast per region per second (D25).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import http from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Server, type Socket } from "socket.io";
import { openDb, SCHEMA, type Driver } from "./lib/db.ts";
import {
  BROADCAST_MS,
  PORT,
  POINTS_PER_CORRECT,
  POWER_APPLY_MS,
  RECENT_LIMIT,
  REP_COUNT,
  levelFor,
  powerOf,
  settle,
  upgrade,
  type RegionState,
} from "./lib/game.ts";
import { makeProblem, type Problem } from "./lib/problem.ts";

const DRIVER = (process.env.SQLITE_DRIVER ?? "better") as Driver;
const DB_PATH = process.env.DB_PATH ?? "/data/ktd.db";
const SEED_PATH = process.env.SEED_PATH ?? new URL("./data/seed.db", import.meta.url).pathname;
const FLUSH_MS = Number(process.env.FLUSH_MS ?? 50);
const SYNCHRONOUS = process.env.SQLITE_SYNC ?? "FULL";
// Load test only: reveal the answer index so the generator can answer correctly.
const REVEAL_ANSWER = process.env.LOAD_TEST_REVEAL === "1";

if (!existsSync(DB_PATH)) copyFileSync(SEED_PATH, DB_PATH);
const db = openDb(DB_PATH, DRIVER, SYNCHRONOUS);
db.exec(SCHEMA);

const q = {
  guardian: db.prepare("SELECT * FROM guardians WHERE id = ?"),
  openProblem: db.prepare("SELECT * FROM open_problems WHERE guardian_id = ?"),
  recentKeys: db.prepare("SELECT expr_key FROM recent_answers WHERE guardian_id = ? ORDER BY id DESC LIMIT 50"),
  updateGuardian: db.prepare(
    "UPDATE guardians SET points = ?, wallet = ?, level = ?, stage = ?, power = ?, streak = ?, today_correct = ?, problem_seq = ?, last_seen = ? WHERE id = ?",
  ),
  insertAnswer: db.prepare(
    "INSERT INTO recent_answers (guardian_id, problem_id, expr_key, correct, ms, at) VALUES (?,?,?,?,?,?)",
  ),
  trimAnswers: db.prepare(
    `DELETE FROM recent_answers WHERE guardian_id = ? AND id <= (
       SELECT id FROM recent_answers WHERE guardian_id = ? ORDER BY id DESC LIMIT 1 OFFSET ${RECENT_LIMIT})`,
  ),
  upsertOpen: db.prepare(
    `INSERT INTO open_problems VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(guardian_id) DO UPDATE SET problem_id = excluded.problem_id, seed = excluded.seed,
       expr = excluded.expr, choices = excluded.choices, answer = excluded.answer, sent_at = excluded.sent_at`,
  ),
  updateRegion: db.prepare(
    `UPDATE regions SET wave = ?, wave_started_at = ?, power = ?, next_power = ?, best_wave = ?, best_wave_at = ?,
       today_correct = ?, today_breaches = ? WHERE code = ?`,
  ),
  allRegions: db.prepare("SELECT * FROM regions ORDER BY code"),
  powerByRegion: db.prepare("SELECT region, SUM(power) AS p, COUNT(*) AS n FROM guardians GROUP BY region"),
  regionStats: db.prepare(
    "SELECT SUM(points) AS points, SUM(power) AS power, COUNT(*) AS n FROM guardians WHERE region = ?",
  ),
  answerExists: db.prepare("SELECT 1 FROM recent_answers WHERE guardian_id = ? AND problem_id = ?"),
  guardianPoints: db.prepare("SELECT points FROM guardians WHERE id = ?"),
};

// ---- regions -------------------------------------------------------------------------------

interface Region extends RegionState {
  online: number;
  pendingDelta: number;
  correctThisSecond: number;
  /** actual send time of the last broadcast; the next one waits at least BROADCAST_MS after it */
  lastSentAt: number;
  reps: { n: number; s: number; l: number }[];
}

const regions = new Map<string, Region>();
const dirtyRegions = new Set<Region>();
const bootAt = Date.now();
{
  const sums = new Map<string, { p: number; n: number }>();
  for (const row of q.powerByRegion.all()) sums.set(row.region as string, { p: row.p as number, n: row.n as number });
  for (const row of q.allRegions.all()) {
    const r: Region = {
      code: row.code as string,
      wave: row.wave as number,
      waveStartedAt: row.wave_started_at as number,
      power: row.power as number,
      nextPower: row.next_power as number,
      bestWave: row.best_wave as number,
      bestWaveAt: row.best_wave_at as number,
      guardianCount: row.guardian_count as number,
      todayCorrect: row.today_correct as number,
      todayBreaches: row.today_breaches as number,
      online: 0,
      pendingDelta: 0,
      correctThisSecond: 0,
      lastSentAt: 0,
      reps: [],
    };
    // Power deltas still in memory at a crash are lost; guardian rows are the truth.
    const sum = sums.get(r.code);
    if (sum && sum.p !== r.nextPower) r.nextPower = sum.p;
    settle(r, bootAt);
    regions.set(r.code, r);
    dirtyRegions.add(r);
  }
}

function writeRegion(r: Region) {
  q.updateRegion.run(r.wave, r.waveStartedAt, r.power, r.nextPower, r.bestWave, r.bestWaveAt, r.todayCorrect, r.todayBreaches, r.code);
}

// ---- guardians -----------------------------------------------------------------------------

interface Guardian {
  id: string;
  nick: number;
  region: Region;
  points: number;
  wallet: number;
  level: number;
  stage: number;
  power: number;
  streak: number;
  todayCorrect: number;
  problemSeq: number;
  recentKeys: string[];
  open: Problem;
  last: { pid: string; result: AnswerResult | null; waiters: ((r: AnswerResult) => void)[] } | null;
  sockets: number;
}

interface AnswerResult {
  ok: boolean;
  pid?: string;
  correct?: boolean;
  points?: number;
  level?: number;
  stage?: number;
  next?: PublicProblem;
  code?: string;
  /** server-side ms from receiving the answer to sending the ack (load test diagnostics) */
  st?: number;
}

type PublicProblem = { id: string; expr: string; choices: string[]; a?: number };

const online = new Map<string, Guardian>();

function publicProblem(p: Problem): PublicProblem {
  const out: PublicProblem = { id: p.id, expr: p.expr, choices: p.choices };
  if (REVEAL_ANSWER) out.a = p.answer;
  return out;
}

function loadGuardian(id: string, keyHash: string): Guardian | null {
  const row = q.guardian.get(id);
  if (!row || row.key_hash !== keyHash) return null;
  const region = regions.get(row.region as string)!;
  const recentKeys = q.recentKeys.all(id).map((r) => r.expr_key as string);
  const now = Date.now();
  const openRow = q.openProblem.get(id);
  let open: Problem;
  if (openRow) {
    open = {
      id: openRow.problem_id as string,
      seed: openRow.seed as number,
      expr: openRow.expr as string,
      key: openRow.expr as string,
      choices: JSON.parse(openRow.choices as string),
      answer: openRow.answer as number,
      sentAt: openRow.sent_at as number,
    };
  } else {
    open = makeProblem(id, row.problem_seq as number, recentKeys, now);
    queue.push({ kind: "open", guardianId: id, problem: open });
  }
  return {
    id,
    nick: row.nick as number,
    region,
    points: row.points as number,
    wallet: row.wallet as number,
    level: row.level as number,
    stage: row.stage as number,
    power: row.power as number,
    streak: row.streak as number,
    todayCorrect: row.today_correct as number,
    problemSeq: row.problem_seq as number,
    recentKeys,
    open,
    last: null,
    sockets: 0,
  };
}

// ---- write queue (D57: commit before ack) --------------------------------------------------

type QueueItem =
  | { kind: "open"; guardianId: string; problem: Problem }
  | {
      kind: "answer";
      row: [number, number, number, number, number, number, number, number, number, string];
      answer: [string, string, string, number, number, number];
      next: Problem;
      done: () => void;
      fail: () => void;
    };

let queue: QueueItem[] = [];
const metrics = {
  processed: 0,
  duplicates: 0,
  rejected: 0,
  flushes: 0,
  flushMaxMs: 0,
  flushTotalMs: 0,
  flushErrors: 0,
  broadcasts: 0,
  maxBroadcastBytes: 0,
  lastPowerApplyAt: 0,
  minConnections: 0,
};
let connectedSockets = 0;

function writeOpen(guardianId: string, p: Problem) {
  q.upsertOpen.run(guardianId, p.id, p.seed, p.expr, JSON.stringify(p.choices), p.answer, p.sentAt);
}

function flush() {
  if (queue.length === 0 && dirtyRegions.size === 0) return;
  const batch = queue;
  queue = [];
  const dirty = [...dirtyRegions];
  dirtyRegions.clear();
  const t0 = performance.now();
  try {
    db.transaction(() => {
      for (const item of batch) {
        if (item.kind === "open") {
          writeOpen(item.guardianId, item.problem);
          continue;
        }
        q.updateGuardian.run(...item.row);
        q.insertAnswer.run(...item.answer);
        q.trimAnswers.run(item.answer[0], item.answer[0]);
        writeOpen(item.answer[0], item.next);
      }
      for (const r of dirty) writeRegion(r);
    });
  } catch (err) {
    metrics.flushErrors++;
    console.error("flush failed", err);
    for (const item of batch) if (item.kind === "answer") item.fail();
    return;
  }
  const ms = performance.now() - t0;
  metrics.flushes++;
  metrics.flushTotalMs += ms;
  metrics.flushMaxMs = Math.max(metrics.flushMaxMs, ms);
  for (const item of batch) if (item.kind === "answer") item.done();
}
setInterval(flush, FLUSH_MS);

// ---- answer handling -----------------------------------------------------------------------

function handleAnswer(g: Guardian, msg: unknown, ack: (r: AnswerResult) => void) {
  const m = msg as { pid?: unknown; choice?: unknown } | null;
  if (!m || typeof m.pid !== "string" || !Number.isInteger(m.choice)) return ack({ ok: false, code: "bad" });
  const choice = m.choice as number;
  if (g.last && g.last.pid === m.pid) {
    metrics.duplicates++;
    if (g.last.result) ack(g.last.result);
    else g.last.waiters.push(ack);
    return;
  }
  if (g.open.id !== m.pid) {
    metrics.rejected++;
    return ack({ ok: false, code: "stale" });
  }
  const now = Date.now();
  const receivedAt = performance.now();
  const p = g.open;
  const correct = choice === p.answer;
  if (correct) {
    const before = g.power;
    g.points += POINTS_PER_CORRECT;
    g.level = levelFor(g.points, g.level);
    const up = upgrade(g.stage, g.wallet + POINTS_PER_CORRECT);
    g.stage = up.stage;
    g.wallet = up.wallet;
    g.power = powerOf(g.level, g.stage);
    g.region.pendingDelta += g.power - before;
    g.region.correctThisSecond++;
    g.region.todayCorrect++;
    g.todayCorrect++;
    g.streak++;
  } else {
    g.streak = 0;
  }
  g.problemSeq++;
  g.recentKeys.unshift(p.key);
  if (g.recentKeys.length > RECENT_LIMIT) g.recentKeys.pop();
  const next = makeProblem(g.id, g.problemSeq, g.recentKeys, now);
  g.open = next;
  const result: AnswerResult = {
    ok: true,
    pid: p.id,
    correct,
    points: g.points,
    level: g.level,
    stage: g.stage,
    next: publicProblem(next),
  };
  const last = { pid: p.id, result: null as AnswerResult | null, waiters: [ack] };
  g.last = last;
  metrics.processed++;
  queue.push({
    kind: "answer",
    row: [g.points, g.wallet, g.level, g.stage, g.power, g.streak, g.todayCorrect, g.problemSeq, now, g.id],
    answer: [g.id, p.id, p.key, correct ? 1 : 0, now - p.sentAt, now],
    next,
    done: () => {
      result.st = Math.round(performance.now() - receivedAt);
      last.result = result;
      for (const w of last.waiters) w(result);
    },
    fail: () => {
      const failed = { ok: false, code: "db" };
      for (const w of last.waiters) w(failed);
    },
  });
}

// ---- region loop: waves, power batches, broadcasts -----------------------------------------

function refreshReps(r: Region) {
  const top: Guardian[] = [];
  for (const g of online.values()) {
    if (g.region !== r) continue;
    top.push(g);
    if (top.length > REP_COUNT * 4) {
      top.sort((a, b) => b.stage - a.stage);
      top.length = REP_COUNT;
    }
  }
  top.sort((a, b) => b.stage - a.stage);
  r.reps = top.slice(0, REP_COUNT).map((g) => ({ n: g.nick, s: g.stage, l: g.level }));
}

function regionTick() {
  const now = Date.now();
  for (const r of regions.values()) {
    if (r.online === 0) continue;
    if (settle(r, now)) dirtyRegions.add(r);
    // At most one broadcast per region per BROADCAST_MS of real time: the next one is due exactly
    // BROADCAST_MS after the previous actual send. A fixed 1 s grid plus this minimum gap would let lateness
    // ratchet up until slots get skipped (measured: 6.7 % missed), so the schedule follows the last send.
    // s = scheduled time, t = actual send time, so clients see delays caused by a stalled event loop.
    const due = r.lastSentAt === 0 ? now : r.lastSentAt + BROADCAST_MS;
    if (now < due) continue;
    const payload = {
      s: due,
      t: now,
      r: r.code,
      w: r.wave,
      ws: r.waveStartedAt,
      p: r.power,
      np: r.nextPower,
      b: r.bestWave,
      c: r.correctThisSecond,
      on: r.online,
      reps: r.reps,
    };
    r.correctThisSecond = 0;
    r.lastSentAt = now;
    io.to(r.code).emit("state", payload);
    metrics.broadcasts++;
    const bytes = Buffer.byteLength(`42["state",${JSON.stringify(payload)}]`);
    if (bytes > metrics.maxBroadcastBytes) metrics.maxBroadcastBytes = bytes;
  }
}

function applyPower() {
  const now = Date.now();
  for (const r of regions.values()) {
    if (r.online > 0) refreshReps(r);
    if (r.pendingDelta === 0) continue;
    settle(r, now);
    r.nextPower += r.pendingDelta;
    r.pendingDelta = 0;
    dirtyRegions.add(r);
  }
  metrics.lastPowerApplyAt = now;
}

// ---- HTTP: health and PoC check endpoints --------------------------------------------------

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
const ms = (ns: number) => Math.round(ns / 1e4) / 100;

function readNumber(path: string, pattern?: RegExp): number | null {
  try {
    const text = readFileSync(path, "utf8");
    const m = pattern ? text.match(pattern) : [text, text];
    return m ? Number(m[1].trim()) : null;
  } catch {
    return null;
  }
}

/** High-water marks over the whole process / container life (both reset only by a restart). */
function memoryPeaks() {
  const vmHwmKb = readNumber("/proc/self/status", /VmHWM:\s+(\d+) kB/);
  return {
    maxRss: process.resourceUsage().maxRSS * 1024,
    vmHwm: vmHwmKb === null ? null : vmHwmKb * 1024,
    cgroupPeak: readNumber("/sys/fs/cgroup/memory.peak"),
    cgroupCurrent: readNumber("/sys/fs/cgroup/memory.current"),
  };
}

function json(res: http.ServerResponse, body: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

async function handleHttp(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") {
    const mem = process.memoryUsage();
    const body = {
      now: Date.now(),
      driver: DRIVER,
      flushMs: FLUSH_MS,
      synchronous: SYNCHRONOUS,
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      external: mem.external,
      connections: io.engine.clientsCount,
      queue: queue.length,
      eventLoop: { p50: ms(loopDelay.percentile(50)), p99: ms(loopDelay.percentile(99)), max: ms(loopDelay.max) },
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      ...memoryPeaks(),
      ...metrics,
    };
    if (url.searchParams.get("reset") === "1") {
      metrics.minConnections = connectedSockets;
      loopDelay.reset();
      metrics.flushMaxMs = 0;
      metrics.maxBroadcastBytes = 0;
    }
    return json(res, body);
  }
  if (url.pathname === "/stats") {
    const code = url.searchParams.get("region") ?? "";
    const r = regions.get(code);
    if (!r) return json(res, { error: "no region" }, 404);
    const db = q.regionStats.get(code)!;
    const row = q.allRegions.all().find((x) => x.code === code)!;
    return json(res, {
      dbPoints: db.points,
      dbPowerSum: db.power,
      dbNextPower: row.next_power,
      dbPower: row.power,
      dbWave: row.wave,
      dbWaveStartedAt: row.wave_started_at,
      memNextPower: r.nextPower,
      pendingDelta: r.pendingDelta,
      queue: queue.length,
      lastPowerApplyAt: metrics.lastPowerApplyAt,
      processed: metrics.processed,
      duplicates: metrics.duplicates,
    });
  }
  if (url.pathname === "/regions") {
    const sums = new Map(q.powerByRegion.all().map((x) => [x.region as string, x.p as number]));
    const rows = url.searchParams.get("source") === "mem" ? [...regions.values()].map(({ code, wave, waveStartedAt, nextPower, bestWave }) => ({ code, wave, waveStartedAt, nextPower, bestWave }))
      : q.allRegions.all().map((x) => ({
          code: x.code,
          wave: x.wave,
          waveStartedAt: x.wave_started_at,
          nextPower: x.next_power,
          bestWave: x.best_wave,
        }));
    return json(res, { now: Date.now(), regions: rows, guardianPowerSums: Object.fromEntries(sums) });
  }
  if (url.pathname === "/verify" && req.method === "POST") {
    // body: [[guardianId, problemId, ackedPoints], ...]
    const pairs = JSON.parse(await readBody(req)) as [string, string, number][];
    let missingAnswers = 0;
    let pointsBehind = 0;
    for (const [gid, pid, points] of pairs) {
      if (!q.answerExists.get(gid, pid)) missingAnswers++;
      const row = q.guardianPoints.get(gid);
      if (!row || (row.points as number) < points) pointsBehind++;
    }
    return json(res, { checked: pairs.length, missingAnswers, pointsBehind });
  }
  json(res, { error: "not found" }, 404);
}

const httpServer = http.createServer((req, res) => {
  handleHttp(req, res).catch((err) => {
    console.error("http error", err);
    json(res, { error: "server" }, 500);
  });
});

const io = new Server(httpServer, {
  ...(process.env.WS_ONLY === "1" ? { transports: ["websocket" as const] } : {}),
  ...(process.env.SMALL_BUFFER === "1" ? { maxHttpBufferSize: 4096, perMessageDeflate: false } : {}),
});

io.use((socket, next) => {
  const auth = socket.handshake.auth as { gid?: unknown; key?: unknown };
  if (typeof auth.gid !== "string" || typeof auth.key !== "string") return next(new Error("auth"));
  let g = online.get(auth.gid);
  if (!g) {
    const loaded = loadGuardian(auth.gid, createHash("sha256").update(auth.key).digest("hex"));
    if (!loaded) return next(new Error("auth"));
    g = loaded;
    online.set(g.id, g);
  }
  socket.data.gid = g.id;
  next();
});

io.on("connection", (socket: Socket) => {
  const g = online.get(socket.data.gid as string)!;
  g.sockets++;
  connectedSockets++;
  if (g.sockets === 1) g.region.online++;
  socket.join(g.region.code);
  socket.emit("problem", publicProblem(g.open));
  socket.on("answer", (msg: unknown, ack: unknown) => {
    if (typeof ack !== "function") return;
    handleAnswer(g, msg, ack as (r: AnswerResult) => void);
  });
  socket.on("disconnect", () => {
    connectedSockets--;
    if (connectedSockets < metrics.minConnections) metrics.minConnections = connectedSockets;
    g.sockets--;
    if (g.sockets === 0) {
      g.region.online--;
      online.delete(g.id);
    }
  });
});

setInterval(regionTick, 25);
setInterval(applyPower, POWER_APPLY_MS);
httpServer.listen(PORT, () => {
  console.log(`ktd-load server on :${PORT} driver=${DRIVER} flush=${FLUSH_MS}ms sync=${SYNCHRONOUS} processUptime=${Math.round(process.uptime() * 1000)}ms`);
});
