// Load generator orchestrator for T1. Usage: tsx run.ts s1|s2|s3|s4
// Env: LOAD_URL (http://127.0.0.1:4100), WORKERS (4), S2_SECONDS (600), S3_SECONDS (60), S3_KILL_AT (40),
//      S3_DOWN_SECONDS (65), S4_SECONDS (120), RATE (1000), CONNECTIONS (10000), CONTAINER (ktd-load)
import http from "node:http";
import { fork, type ChildProcess, type Serializable } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { io } from "socket.io-client";
import { guardianKey } from "./lib/game.ts";
import { count, fromSparse, merge, newHist, percentile } from "./lib/hist.ts";

const URL_BASE = process.env.LOAD_URL ?? "http://127.0.0.1:4100";
const WORKERS = Number(process.env.WORKERS ?? 4);
const RATE = Number(process.env.RATE ?? 1000);
const CONNECTIONS = Number(process.env.CONNECTIONS ?? 10_000);
const CONTAINER = process.env.CONTAINER ?? "ktd-load";
// Docker Engine API over the unix socket, so S3 also runs from a generator container (socket mounted).
const DOCKER_SOCK = process.env.DOCKER_SOCK ?? "/var/run/docker.sock";
const ACK_TIMEOUT_MS = 10_000;
const BIG_REGION = "R000";
// Official S2 bar (D56). Fixed here so env overrides can only make a "reference" run, never lower the bar.
const S2_OFFICIAL = { connections: 10_000, ratePerSecond: 990, seconds: 600 } as const;
const S1_SIZE = 1000;
const HERE = new URL(".", import.meta.url).pathname;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const scenario = process.argv[2];
const runDir = `${HERE}results/${scenario}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
mkdirSync(runDir, { recursive: true });

// ---- helpers -------------------------------------------------------------------------------

type Health = {
  now: number;
  driver: string;
  flushMs: number;
  synchronous: string;
  rss: number;
  connections: number;
  queue: number;
  eventLoop: { p50: number; p99: number; max: number };
  cpu: { user: number; system: number };
  uptime: number;
  processed: number;
  duplicates: number;
  flushMaxMs: number;
  flushes: number;
  flushTotalMs: number;
  flushErrors: number;
  maxBroadcastBytes: number;
  lastPowerApplyAt: number;
  minConnections: number;
  maxRss: number;
  vmHwm: number | null;
  cgroupPeak: number | null;
  cgroupCurrent: number | null;
};

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(URL_BASE + path, init);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}
const health = (reset = false) => getJson<Health>(`/health${reset ? "?reset=1" : ""}`);
// After a kill, a pooled keep-alive socket can hang; a short timeout makes the next poll use a new one.
const healthProbe = () => getJson<Health>("/health", { signal: AbortSignal.timeout(300) });

async function clockOffset(): Promise<number> {
  let best = { rtt: Infinity, offset: 0 };
  for (let i = 0; i < 10; i++) {
    const t0 = Date.now();
    const h = await health();
    const t1 = Date.now();
    if (t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: h.now - (t0 + t1) / 2 };
  }
  return best.offset;
}

function allGuardians(): [string, string][] {
  return JSON.parse(readFileSync(`${HERE}data/guardians.json`, "utf8"));
}
const s1Guardians = () => allGuardians().filter(([, r]) => r === BIG_REGION).slice(0, S1_SIZE).map(([g]) => g);
function backgroundGuardians(n: number): string[] {
  const exclude = new Set(s1Guardians());
  const pool = allGuardians().map(([g]) => g).filter((g) => !exclude.has(g));
  let s = 7;
  for (let i = pool.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

interface WorkerDone {
  stats: Record<string, number>;
  answerHist: [number, number][];
  broadcastHist: [number, number][];
  transferHist: [number, number][];
  slotHist: [number, number][];
  serverHist: [number, number][];
}

class Pool {
  procs: ChildProcess[] = [];
  logs: string[] = [];
  label: string;
  constructor(label: string) {
    this.label = label;
  }

  async start(guardians: string[], workers: number, offset: number) {
    const per = Math.ceil(guardians.length / workers);
    const t0 = Date.now();
    const results = await Promise.all(
      Array.from({ length: workers }, (_, i) => {
        const proc = fork(`${HERE}lib/worker.ts`, [], { execArgv: [] });
        const logFile = `${runDir}/${this.label}-w${i}.log`;
        this.procs.push(proc);
        this.logs.push(logFile);
        proc.send({
          type: "init",
          url: URL_BASE,
          guardians: guardians.slice(i * per, (i + 1) * per),
          logFile,
          clockOffset: offset,
          ackTimeoutMs: ACK_TIMEOUT_MS,
        });
        return this.next<{ connected: number; failed: number; errorSamples: string[] }>(proc, "connected");
      }),
    );
    const connected = results.reduce((a, r) => a + r.connected, 0);
    const failed = results.reduce((a, r) => a + r.failed, 0);
    const samples = [...new Set(results.flatMap((r) => r.errorSamples))];
    console.log(`[${this.label}] connected ${connected}, failed ${failed} in ${Date.now() - t0} ms ${samples.join(" | ")}`);
    return { connected, failed, ms: Date.now() - t0 };
  }

  next<T>(proc: ChildProcess, type: string): Promise<T> {
    return new Promise((resolve) => {
      const on = (m: { type: string }) => {
        if (m.type !== type) return;
        proc.off("message", on);
        resolve(m as T);
      };
      proc.on("message", on);
    });
  }

  broadcast(msg: Serializable) {
    for (const p of this.procs) p.send(msg);
  }

  async collect() {
    const done = await Promise.all(this.procs.map((p) => this.next<WorkerDone>(p, "done")));
    const answerHist = newHist();
    const broadcastHist = newHist();
    const transferHist = newHist();
    const slotHist = newHist();
    const serverHist = newHist();
    const stats: Record<string, number> = {};
    for (const d of done) {
      merge(answerHist, fromSparse(d.answerHist));
      merge(broadcastHist, fromSparse(d.broadcastHist));
      merge(transferHist, fromSparse(d.transferHist));
      merge(slotHist, fromSparse(d.slotHist));
      merge(serverHist, fromSparse(d.serverHist));
      for (const [k, v] of Object.entries(d.stats)) {
        if (k === "minSendGapMs") stats[k] = Math.min(stats[k] ?? Infinity, v ?? Infinity);
        else if (["maxBroadcastBytes", "maxSendGapMs", "poissonMs"].includes(k)) stats[k] = Math.max(stats[k] ?? 0, v);
        else stats[k] = (stats[k] ?? 0) + v;
      }
    }
    return { stats, answerHist, broadcastHist, transferHist, slotHist, serverHist };
  }

  close() {
    this.broadcast({ type: "close" });
  }
}

/** Count duplicates and missing acks from the S/A lines of the worker logs. */
function auditLogs(files: string[]) {
  const sent = new Map<string, number>();
  const acked = new Map<string, number>();
  const ackedList: [string, string, number][] = [];
  for (const f of files) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const [kind, gid, pid, points] = line.split(" ");
      if (kind === "S") sent.set(pid, (sent.get(pid) ?? 0) + 1);
      if (kind === "A") {
        acked.set(pid, (acked.get(pid) ?? 0) + 1);
        ackedList.push([gid, pid, Number(points)]);
      }
    }
  }
  let duplicateSends = 0;
  let duplicateAcks = 0;
  let missingAcks = 0;
  for (const [pid, n] of sent) {
    if (n > 1) duplicateSends++;
    if (!acked.has(pid)) missingAcks++;
  }
  for (const n of acked.values()) if (n > 1) duplicateAcks++;
  return { sent: sent.size, acked: acked.size, duplicateSends, duplicateAcks, missingAcks, ackedList };
}

function latency(h: number[]) {
  return { n: count(h), p50: percentile(h, 50), p95: percentile(h, 95), p99: percentile(h, 99), max: percentile(h, 100) };
}

function docker(method: "GET" | "POST", path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: DOCKER_SOCK, method, path }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => ((res.statusCode ?? 500) < 300 ? resolve(body) : reject(new Error(`docker ${path} → ${res.statusCode} ${body}`))));
    });
    req.on("error", reject);
    req.end();
  });
}

async function oomKilled(): Promise<boolean | null> {
  try {
    return (JSON.parse(await docker("GET", `/containers/${CONTAINER}/json`)) as { State: { OOMKilled: boolean } }).State.OOMKilled;
  } catch {
    return null;
  }
}

function save(result: Record<string, unknown>) {
  writeFileSync(`${runDir}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`saved ${runDir}/result.json`);
}

async function waitQueueEmpty() {
  for (let i = 0; i < 100 && (await health()).queue > 0; i++) await sleep(50);
  await sleep(120);
}

// ---- S1 ------------------------------------------------------------------------------------

type Stats = {
  dbPoints: number;
  dbPowerSum: number;
  dbNextPower: number;
  dbPower: number;
  dbWave: number;
  dbWaveStartedAt: number;
  pendingDelta: number;
  queue: number;
  lastPowerApplyAt: number;
  processed: number;
};

async function burstS1(pool: Pool) {
  const at = Date.now() + 300;
  pool.broadcast({ type: "burst", at });
  const res = await pool.collect();
  return { at, ...res };
}

function checkS1(res: Awaited<ReturnType<typeof burstS1>>, audit: ReturnType<typeof auditLogs>) {
  const lat = latency(res.answerHist);
  const errors = res.stats.timeouts + res.stats.rejected + res.stats.disconnects + res.stats.connectErrors;
  return { lat, errors, audit: { ...audit, ackedList: undefined } };
}

async function s1() {
  const offset = await clockOffset();
  const pool = new Pool("s1");
  const conn = await pool.start(s1Guardians(), WORKERS, offset);
  await sleep(1500);
  await waitQueueEmpty();
  const before = await getJson<Stats>(`/stats?region=${BIG_REGION}`);
  const res = await burstS1(pool);
  const burstDone = Date.now();
  const audit = auditLogs(pool.logs);
  await waitQueueEmpty();
  const afterAnswers = await getJson<Stats>(`/stats?region=${BIG_REGION}`);
  let afterPower = afterAnswers;
  while (afterPower.lastPowerApplyAt <= burstDone || afterPower.pendingDelta !== 0) {
    await sleep(500);
    afterPower = await getJson<Stats>(`/stats?region=${BIG_REGION}`);
  }
  await waitQueueEmpty();
  afterPower = await getJson<Stats>(`/stats?region=${BIG_REGION}`);
  // The applied power only counts from the next wave: wait until a wave starts after the apply.
  const appliedAt = afterPower.lastPowerApplyAt;
  let afterWave = afterPower;
  while (afterWave.dbWaveStartedAt < appliedAt) {
    await sleep(1000);
    afterWave = await getJson<Stats>(`/stats?region=${BIG_REGION}`);
  }
  pool.close();
  const { lat, errors } = checkS1(res, audit);
  const pointsDelta = afterAnswers.dbPoints - before.dbPoints;
  const result = {
    scenario: "S1",
    driver: (await health()).driver,
    connections: conn,
    sendWindowMs: "all sent at one instant",
    latency: lat,
    serverSideLatency: latency(res.serverHist),
    workerStats: res.stats,
    audit: { ...audit, ackedList: undefined },
    serverProcessedDelta: afterAnswers.processed - before.processed,
    pointsDelta,
    expectedPointsDelta: S1_SIZE * 10,
    regionNextPower: afterPower.dbNextPower,
    guardianPowerSum: afterPower.dbPowerSum,
    powerAppliedAt: appliedAt,
    nextWave: { wave: afterWave.dbWave, startedAt: afterWave.dbWaveStartedAt, power: afterWave.dbPower, guardianPowerSum: afterWave.dbPowerSum },
    pass: {
      exactlyOnce: audit.acked === S1_SIZE && audit.duplicateAcks === 0 && audit.missingAcks === 0 && afterAnswers.processed - before.processed === S1_SIZE,
      points: pointsDelta === S1_SIZE * 10,
      power: afterPower.dbNextPower === afterPower.dbPowerSum && afterWave.dbWaveStartedAt >= appliedAt && afterWave.dbPower === afterWave.dbPowerSum,
      p95: (lat.p95 ?? Infinity) <= 500,
      p99: (lat.p99 ?? Infinity) <= 1000,
      errors: errors === 0,
    },
  };
  save(result);
}

// ---- S2 / S4 -------------------------------------------------------------------------------

async function sustained(seconds: number, opts: { s1At?: number; killAt?: number }) {
  const offset = await clockOffset();
  const pool = new Pool("bg");
  const conn = await pool.start(backgroundGuardians(CONNECTIONS), WORKERS, offset);
  let s1Pool: Pool | null = null;
  if (opts.s1At !== undefined) {
    s1Pool = new Pool("s1");
    await s1Pool.start(s1Guardians(), WORKERS, offset);
  }
  await sleep(2000);
  const h0 = await health(true);
  const t0 = Date.now();
  pool.broadcast({ type: "poisson", rate: RATE / WORKERS, durationMs: seconds * 1000 });
  const samples: { t: number; rss: number; connections: number; queue: number }[] = [];
  let s1Result: Awaited<ReturnType<typeof burstS1>> | null = null;
  let s1Started = false;
  let killedAt = 0;
  let regionsBeforeKill: unknown = null;
  const doneP = pool.collect();
  let finished = false;
  void doneP.then(() => (finished = true));
  while (!finished) {
    const el = (Date.now() - t0) / 1000;
    if (opts.killAt !== undefined && el >= opts.killAt && !killedAt) {
      regionsBeforeKill = await getJson("/regions?source=mem");
      await docker("POST", `/containers/${CONTAINER}/kill`);
      killedAt = Date.now();
      console.log(`killed ${CONTAINER} at ${el.toFixed(1)} s`);
      pool.broadcast({ type: "stop" });
      break;
    }
    if (s1Pool && !s1Started && el >= opts.s1At!) {
      s1Started = true;
      void burstS1(s1Pool).then((r) => (s1Result = r));
    }
    try {
      const h = await health();
      samples.push({ t: Date.now() - t0, rss: h.rss, connections: h.connections, queue: h.queue });
    } catch (e) {
      console.error("health failed", (e as Error).message);
    }
    await sleep(1000);
  }
  const done = await doneP;
  const wallS = (Date.now() - t0) / 1000;
  const h1 = killedAt ? null : await health();
  while (s1Pool && !s1Result) await sleep(200);
  return { conn, done, samples, h0, h1, wallS, killedAt, regionsBeforeKill, pool, s1Pool, s1Result: s1Result as Awaited<ReturnType<typeof burstS1>> | null };
}

async function summarizeSustained(r: Awaited<ReturnType<typeof sustained>>) {
  const { done, samples, h0, h1, wallS } = r;
  const st = done.stats;
  const lat = latency(done.answerHist);
  const bcastArrival = latency(done.broadcastHist);
  const bcastSlot = latency(done.slotHist);
  const answerErrors = st.timeouts + st.rejected;
  const errorRate = st.sent ? answerErrors / st.sent : 1;
  const poissonS = st.poissonMs / 1000;
  const rate = st.sent / poissonS;
  const expectedSlots = st.broadcastSlots + st.missedSlots;
  const missedSlotRatio = expectedSlots ? st.missedSlots / expectedSlots : 1;
  // Peak RSS = VmHWM of the server process: from process start (fresh container) to the end of the run.
  const rssPeak = h1 ? (h1.vmHwm ?? h1.maxRss) : Math.max(...samples.map((s) => s.rss));
  const cpuAvg = h1 ? (h1.cpu.user + h1.cpu.system - h0.cpu.user - h0.cpu.system) / 1e6 / (h1.uptime - h0.uptime) : null;
  return {
    driver: h0.driver,
    flushMs: h0.flushMs,
    synchronous: h0.synchronous,
    connections: r.conn,
    minServerConnections: h1?.minConnections ?? null,
    minSampledConnections: Math.min(...samples.map((s) => s.connections)),
    poissonSeconds: poissonS,
    wallSecondsWithDrain: wallS,
    answers: { planned: st.planned, sent: st.sent, skippedNotReady: st.skippedNotReady, perSecond: rate },
    latencyNote: "successful acks only; failures are counted in errorRate",
    latency: lat,
    serverSideLatency: latency(done.serverHist),
    broadcastArrivalVsSlot: bcastArrival,
    broadcastSlotDelay: bcastSlot,
    broadcastTransfer: latency(done.transferHist),
    broadcastMinSendGapMs: st.minSendGapMs,
    broadcastSlots: { received: st.broadcastSlots, missed: st.missedSlots, missedRatio: missedSlotRatio, duplicate: st.duplicateSlots, maxSendGapMs: st.maxSendGapMs, regionsWithout: st.regionsWithoutBroadcast, staleAtEnd: st.staleRegionsAtEnd },
    workerStats: st,
    errorRate,
    memory: {
      window: "server process start (fresh container) to end of run",
      vmHwmMB: h1?.vmHwm ? Math.round(h1.vmHwm / 1048576) : null,
      maxRssMB: h1 ? Math.round(h1.maxRss / 1048576) : null,
      cgroupPeakMB: h1?.cgroupPeak ? Math.round(h1.cgroupPeak / 1048576) : null,
      cgroupEndMB: h1?.cgroupCurrent ? Math.round(h1.cgroupCurrent / 1048576) : null,
      sampledRssMaxMB: Math.round(Math.max(...samples.map((s) => s.rss)) / 1048576),
      rssEndMB: Math.round(samples[samples.length - 1].rss / 1048576),
    },
    queueMax: Math.max(...samples.map((s) => s.queue)),
    eventLoop: h1?.eventLoop ?? null,
    cpuAvgCores: cpuAvg,
    flushMaxMs: h1?.flushMaxMs ?? null,
    flushAvgMs: h1 ? (h1.flushTotalMs - h0.flushTotalMs) / Math.max(1, h1.flushes - h0.flushes) : null,
    flushErrors: h1?.flushErrors ?? null,
    serverMaxBroadcastBytes: h1?.maxBroadcastBytes ?? null,
    oomKilled: await oomKilled(),
    // Reference target only (plan: "여유 목표 ≤ 600MB"); not part of pass/officialPass.
    targets: { rss600: rssPeak <= 600 * 1048576 },
    pass: {
      connections: r.conn.connected >= S2_OFFICIAL.connections && st.connectErrors === 0 && (h1?.minConnections ?? 0) >= S2_OFFICIAL.connections,
      duration: poissonS >= S2_OFFICIAL.seconds,
      rate: rate >= S2_OFFICIAL.ratePerSecond && st.skippedNotReady === 0 && st.planned === st.sent,
      p95: (lat.p95 ?? Infinity) <= 500,
      p99: (lat.p99 ?? Infinity) <= 1000,
      broadcastP95: (bcastSlot.p95 ?? Infinity) <= 2000 && (bcastArrival.p95 ?? Infinity) <= 2000,
      broadcastOncePerSecond: st.duplicateSlots === 0 && st.minSendGapMs >= 1000,
      broadcastGaps: missedSlotRatio <= 0.001 && st.maxSendGapMs <= 3000 && st.regionsWithoutBroadcast === 0 && st.staleRegionsAtEnd === 0,
      messageSize: Math.max(st.maxBroadcastBytes, h1?.maxBroadcastBytes ?? 0) <= 2048,
      rss: rssPeak <= 768 * 1048576,
      errorRate: errorRate <= 0.001,
      eventLoopP99: (h1?.eventLoop.p99 ?? Infinity) <= 200,
      cpu: (cpuAvg ?? Infinity) <= 0.7,
      noDisconnects: st.disconnects === 0,
    },
  };
}

async function s2() {
  const seconds = Number(process.env.S2_SECONDS ?? 600);
  const r = await sustained(seconds, {});
  r.pool.close();
  const summary = await summarizeSustained(r);
  const official = CONNECTIONS >= S2_OFFICIAL.connections && RATE * 0.99 >= S2_OFFICIAL.ratePerSecond && seconds >= S2_OFFICIAL.seconds;
  save({
    scenario: "S2",
    seconds,
    runKind: official ? "official" : "reference (settings below the official S2 bar; not an official pass)",
    officialPass: official && Object.values(summary.pass).every(Boolean),
    ...summary,
    rssSamples: r.samples.filter((_, i) => i % 10 === 0) });
}

async function s4() {
  const seconds = Number(process.env.S4_SECONDS ?? 120);
  const r = await sustained(seconds, { s1At: seconds / 2 });
  r.pool.close();
  r.s1Pool?.close();
  const s1 = r.s1Result!;
  const audit = auditLogs(r.s1Pool!.logs);
  save({
    scenario: "S4",
    seconds,
    background: await summarizeSustained(r),
    s1: { latency: latency(s1.answerHist), serverSideLatency: latency(s1.serverHist), workerStats: s1.stats, audit: { ...audit, ackedList: undefined } },
  });
}

// ---- S3 ------------------------------------------------------------------------------------

type RegionRow = { code: string; wave: number; waveStartedAt: number; nextPower: number; bestWave: number };

async function firstAnswerAfterRestart(gid: string, startedAt: number, dockerStartMs: number) {
  let healthMs = -1;
  let serverUptimeAtFirstHealthMs = -1;
  while (Date.now() - startedAt < 60_000) {
    try {
      const h = await healthProbe();
      healthMs = Date.now() - startedAt;
      serverUptimeAtFirstHealthMs = Math.round(h.uptime * 1000);
      break;
    } catch {
      await sleep(50);
    }
  }
  const socket = io(URL_BASE, { transports: ["websocket"], forceNew: true, reconnection: false, auth: { gid, key: guardianKey(gid) } });
  const problem = await new Promise<{ id: string; a: number }>((resolve) => socket.once("problem", resolve));
  const ack = await socket.timeout(5000).emitWithAck("answer", { pid: problem.id, choice: problem.a });
  const ackMs = Date.now() - startedAt;
  socket.disconnect();
  return { dockerStartMs, healthMs, serverUptimeAtFirstHealthMs, ackMs, ackOk: (ack as { ok: boolean }).ok };
}

async function s3() {
  const seconds = Number(process.env.S3_SECONDS ?? 60);
  const killAt = Number(process.env.S3_KILL_AT ?? 40);
  const r = await sustained(seconds, { killAt });
  const audit = auditLogs(r.pool.logs);
  r.pool.close();
  // Stay down past a wave boundary so the restart must settle at least one missed wave.
  const downSeconds = Number(process.env.S3_DOWN_SECONDS ?? 65);
  await sleep(downSeconds * 1000);
  const startedAt = Date.now();
  await docker("POST", `/containers/${CONTAINER}/start`);
  const restart = await firstAnswerAfterRestart(s1Guardians()[0], startedAt, Date.now() - startedAt);
  const verify = await getJson<{ checked: number; missingAnswers: number; pointsBehind: number }>("/verify", {
    method: "POST",
    body: JSON.stringify(audit.ackedList),
  });
  const before = (r.regionsBeforeKill as { regions: RegionRow[] }).regions;
  const after = await getJson<{ now: number; regions: RegionRow[]; guardianPowerSums: Record<string, number> }>("/regions");
  const byCode = new Map(after.regions.map((x) => [x.code, x]));
  let offGrid = 0;
  let resetToStart = 0;
  let notCurrent = 0;
  let powerMismatch = 0;
  for (const b of before) {
    const a = byCode.get(b.code)!;
    const k = (a.waveStartedAt - b.waveStartedAt) / 60_000;
    if (!Number.isInteger(k) || k < 0) offGrid++;
    if (a.wave < Math.max(1, b.wave - 5 * Math.max(1, k)) || (b.wave > 6 && a.wave === 1)) resetToStart++;
    if (after.now - a.waveStartedAt >= 60_000 + 1000) notCurrent++;
    if (a.nextPower !== after.guardianPowerSums[a.code]) powerMismatch++;
  }
  const result = {
    scenario: "S3",
    driver: r.h0.driver,
    loadSecondsBeforeKill: killAt,
    downSeconds,
    connections: r.conn,
    ackedBeforeKill: audit.acked,
    sentBeforeKill: audit.sent,
    // Logs are closed only after every in-flight answer settled (ack, reject, or error/timeout after the kill).
    settledAtKill: { acked: r.done.stats.acked, rejected: r.done.stats.rejected, lostAtKill: r.done.stats.lostAtKill, timeouts: r.done.stats.timeouts, unsettled: r.done.stats.sent - r.done.stats.acked - r.done.stats.rejected - r.done.stats.lostAtKill - r.done.stats.timeouts },
    verify,
    restart,
    waves: { regions: before.length, minWavesPassed: Math.min(...before.map((b) => (byCode.get(b.code)!.waveStartedAt - b.waveStartedAt) / 60_000)), offGrid, resetToStart, notCurrent, powerMismatch },
    pass: {
      noLostAcked: verify.checked === audit.acked && audit.acked === r.done.stats.acked && verify.missingAnswers === 0 && verify.pointsBehind === 0,
      respondsWithin5s: restart.ackOk && restart.ackMs <= 5000,
      wavesContinue: offGrid === 0 && resetToStart === 0 && notCurrent === 0,
    },
  };
  save(result);
}

const scenarios: Record<string, () => Promise<void>> = { s1, s2, s3, s4 };
const fn = scenarios[scenario];
if (!fn) {
  console.error("usage: tsx run.ts s1|s2|s3|s4");
  process.exit(1);
}
fn()
  .then(() => setTimeout(() => process.exit(0), 500))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
