// One load generator process: holds a share of the socket.io connections (websocket only),
// sends answers on command and logs every sent answer (S) and ack (A) to a file.
import { createWriteStream } from "node:fs";
import { io, type Socket } from "socket.io-client";
import { guardianKey } from "./game.ts";
import { newHist, record, toSparse } from "./hist.ts";

interface Init {
  type: "init";
  url: string;
  guardians: string[];
  logFile: string;
  clockOffset: number;
  ackTimeoutMs: number;
}
type Command =
  | Init
  | { type: "burst"; at: number }
  | { type: "poisson"; rate: number; durationMs: number }
  | { type: "stop" }
  | { type: "close" };

interface Client {
  gid: string;
  socket: Socket;
  problem: { id: string; a: number } | null;
  inFlight: boolean;
  region: string | null;
}

const send = (msg: unknown) => process.send!(msg);
let cfg: Init;
let log: ReturnType<typeof createWriteStream>;
let logClosed = false;
const writeLog = (line: string) => {
  if (!logClosed) log.write(line);
};
const clients: Client[] = [];
const answerHist = newHist();
// Broadcast delays. s = scheduled 1 s slot on the server clock, t = when the server actually sent it.
const broadcastHist = newHist(); // per socket: arrival - scheduled slot (includes event-loop stalls)
const transferHist = newHist(); // per socket: arrival - actual send time
const slotHist = newHist(); // per region slot: first arrival - slot; a missed slot counts until the next arrival
const serverHist = newHist();
const stats = {
  sent: 0,
  acked: 0,
  errors: 0,
  timeouts: 0,
  rejected: 0,
  disconnects: 0,
  connectErrors: 0,
  connectRetries: 0,
  lostAtKill: 0,
  broadcasts: 0,
  broadcastSlots: 0,
  missedSlots: 0,
  duplicateSlots: 0,
  maxSendGapMs: 0,
  minSendGapMs: Infinity,
  regionsWithoutBroadcast: 0,
  staleRegionsAtEnd: 0,
  maxBroadcastBytes: 0,
  planned: 0,
  skippedNotReady: 0,
  poissonMs: 0,
};
const CONNECT_ATTEMPTS = 5;
const connectErrorSamples = new Set<string>();
const regionSlots = new Map<string, { slot: number; t: number }>();
let measuring = false;
let finished = false;
let stopped = false;
let poissonTimer: NodeJS.Timeout | null = null;
let pending = 0;
let onDrained: (() => void) | null = null;

function connect(gid: string): Promise<Client> {
  return new Promise((resolve) => {
    const socket = io(cfg.url, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      timeout: 20_000,
      auth: { gid, key: guardianKey(gid) },
    });
    const client: Client = { gid, socket, problem: null, inFlight: false, region: null };
    socket.on("problem", (p: { id: string; a: number }) => (client.problem = p));
    socket.on("state", (msg: { s: number; t: number; r: string }) => onState(client, msg));
    socket.on("disconnect", () => {
      if (!stopped) stats.disconnects++;
    });
    let attempts = 0;
    socket.once("connect", () => resolve(client));
    socket.on("connect_error", (err) => {
      if (!socket.connected && ++attempts < CONNECT_ATTEMPTS) {
        stats.connectRetries++;
        if (connectErrorSamples.size < 5) connectErrorSamples.add(err.message);
        setTimeout(() => socket.connect(), 200 * attempts);
        return;
      }
      stats.connectErrors++;
      resolve(client);
    });
  });
}

function onState(client: Client, msg: { s: number; t: number; r: string }) {
  client.region = msg.r;
  if (!measuring) return;
  const now = Date.now() + cfg.clockOffset;
  stats.broadcasts++;
  record(broadcastHist, now - msg.s);
  record(transferHist, now - msg.t);
  const prev = regionSlots.get(msg.r);
  if (prev && msg.s === prev.slot) {
    if (msg.t !== prev.t) stats.duplicateSlots++;
    return;
  }
  if (prev && msg.s < prev.slot) {
    stats.duplicateSlots++;
    return;
  }
  if (prev) {
    stats.minSendGapMs = Math.min(stats.minSendGapMs, msg.t - prev.t);
    stats.maxSendGapMs = Math.max(stats.maxSendGapMs, msg.t - prev.t);
  }
  // This broadcast was due at s but went out at t: every further 1 s period that passed in between
  // (s + 1000, s + 2000, ... <= t) is a broadcast that never happened. Count it right here.
  for (let k = msg.s + 1000; k <= msg.t; k += 1000) {
    stats.missedSlots++;
    record(slotHist, now - k);
  }
  stats.broadcastSlots++;
  record(slotHist, now - msg.s);
  regionSlots.set(msg.r, { slot: msg.s, t: msg.t });
  const bytes = Buffer.byteLength(`42["state",${JSON.stringify(msg)}]`);
  if (bytes > stats.maxBroadcastBytes) stats.maxBroadcastBytes = bytes;
}

function answer(c: Client) {
  const p = c.problem!;
  c.inFlight = true;
  stats.sent++;
  pending++;
  const sentAt = performance.now();
  writeLog(`S ${c.gid} ${p.id}\n`);
  c.socket
    .timeout(cfg.ackTimeoutMs)
    .emit("answer", { pid: p.id, choice: p.a }, (err: Error | null, res: { ok: boolean; st: number; points: number; next: { id: string; a: number }; code?: string }) => {
      const lat = performance.now() - sentAt;
      c.inFlight = false;
      pending--;
      if (err) {
        if (stopped) stats.lostAtKill++;
        else stats.timeouts++;
        writeLog(`T ${c.gid} ${p.id}\n`);
      } else if (!res.ok) {
        stats.rejected++;
        writeLog(`R ${c.gid} ${p.id} ${res.code}\n`);
      } else {
        stats.acked++;
        record(answerHist, lat);
        record(serverHist, res.st);
        c.problem = res.next;
        writeLog(`A ${c.gid} ${p.id} ${res.points} ${lat.toFixed(1)}\n`);
      }
      if (pending === 0 && onDrained) onDrained();
    });
}

function poissonCount(mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = Math.random();
  while (p > limit) {
    k++;
    p *= Math.random();
  }
  return k;
}

function runPoisson(rate: number, durationMs: number) {
  const start = performance.now();
  const end = start + durationMs;
  let last = start;
  const tick = () => {
    const now = Math.min(performance.now(), end);
    const n = poissonCount((rate * (now - last)) / 1000);
    last = now;
    stats.planned += n;
    for (let i = 0; i < n; i++) {
      let picked: Client | null = null;
      for (let tries = 0; tries < 20; tries++) {
        const c = clients[Math.floor(Math.random() * clients.length)];
        if (c.problem && !c.inFlight && c.socket.connected) {
          picked = c;
          break;
        }
      }
      if (picked) answer(picked);
      else stats.skippedNotReady++;
    }
    stats.poissonMs = now - start;
    if (stopped || now >= end) return finish();
    poissonTimer = setTimeout(tick, 5);
  };
  tick();
}

/** Stops new answers; reports only after every in-flight answer is settled (ack, reject or timeout). */
function finish() {
  if (finished) return;
  finished = true;
  const report = () => {
    measuring = false;
    const now = Date.now() + cfg.clockOffset;
    const regions = new Set(clients.filter((c) => c.socket.connected || stopped).map((c) => c.region));
    for (const r of regions) {
      const last = r ? regionSlots.get(r) : undefined;
      if (!last) stats.regionsWithoutBroadcast++;
      else if (!stopped) {
        // Broadcasts due after the last one that still had not arrived well past the 2 s delay bar.
        for (let k = last.t + 1000; now - k > 2000; k += 1000) {
          stats.missedSlots++;
          record(slotHist, now - k);
        }
        if (now - last.t > 3000) stats.staleRegionsAtEnd++;
      }
    }
    logClosed = true;
    log.end(() =>
      send({
        type: "done",
        stats,
        answerHist: toSparse(answerHist),
        broadcastHist: toSparse(broadcastHist),
        transferHist: toSparse(transferHist),
        slotHist: toSparse(slotHist),
        serverHist: toSparse(serverHist),
      }),
    );
  };
  if (pending === 0) return report();
  onDrained = () => {
    onDrained = null;
    report();
  };
}

process.on("message", async (cmd: Command) => {
  if (cmd.type === "init") {
    cfg = cmd;
    log = createWriteStream(cfg.logFile);
    const t0 = Date.now();
    const batch = 50;
    for (let i = 0; i < cfg.guardians.length; i += batch) {
      clients.push(...(await Promise.all(cfg.guardians.slice(i, i + batch).map(connect))));
    }
    const connected = clients.filter((c) => c.socket.connected).length;
    send({ type: "connected", errorSamples: [...connectErrorSamples], connected, failed: clients.length - connected, ms: Date.now() - t0 });
  } else if (cmd.type === "burst") {
    measuring = true;
    setTimeout(() => {
      for (const c of clients) if (c.problem && c.socket.connected) answer(c);
      finish();
    }, Math.max(0, cmd.at - Date.now()));
  } else if (cmd.type === "poisson") {
    measuring = true;
    runPoisson(cmd.rate, cmd.durationMs);
  } else if (cmd.type === "stop") {
    stopped = true;
    if (poissonTimer) clearTimeout(poissonTimer);
    finish();
  } else if (cmd.type === "close") {
    stopped = true;
    for (const c of clients) c.socket.disconnect();
    setTimeout(() => process.exit(0), 200);
  }
});
