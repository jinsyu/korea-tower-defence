/* eslint-disable @typescript-eslint/no-explicit-any -- test responses and rows are read loosely */
// D57: kill the real server process under answers, start it again, and check that every answered point is still there
// and the region goes on from its stored time (no wave 1 again). The server runs on the 60x test clock.
import { newRegionWaves, replayStepwise, WAVE_MS } from "@ktd/core";
import Database from "better-sqlite3";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { io as connect } from "socket.io-client";
import { afterAll, beforeAll, expect, it } from "vitest";
import { hashKey } from "./guardians";

const ORIGIN = "http://localhost:3129";
const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));
const REGION = "11050";

let dir: string;
let child: ChildProcess | undefined;
let base: string;
let env: NodeJS.ProcessEnv;

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

async function startProcess() {
  child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], { cwd: SERVER_DIR, env, stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${base}/health`).then((r) => r.ok, () => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
}

function kill(): Promise<void> {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    child.once("exit", () => resolve());
    child.kill("SIGKILL");
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "ktd-restart-test-"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  env = {
    PATH: process.env.PATH,
    PORT: String(port),
    HOST: "127.0.0.1",
    ALLOWED_ORIGIN: ORIGIN,
    SESSION_SECRET: "restart-test-secret-0123456789abcdefghij",
    DB_PATH: join(dir, "t.db"),
    TEST_CLOCK_RATE: "60",
    TEST_CLOCK_FROM_MS: String(Date.now()),
  };
  await startProcess();
});

afterAll(async () => {
  await kill();
  rmSync(dir, { recursive: true, force: true });
});

const call = (path: string, { key, body, ip = "10.0.0.1" }: { key?: string; body?: unknown; ip?: string } = {}) =>
  fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin: ORIGIN,
      "x-forwarded-for": ip,
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

it("keeps every acknowledged point and goes on from the stored wave after a forced kill (D57)", { timeout: 60_000 }, async () => {
  const keys: string[] = [];
  for (let i = 0; i < 8; i++) {
    const res = await call("/guardians", { body: { region: REGION, nick: { adj: 1, noun: 1, tag: i }, towerType: "rapid" }, ip: `10.0.1.${i}` });
    keys.push(((await res.json()) as any).key);
  }
  const reader = new Database(env.DB_PATH!, { readonly: true });
  const idOf = (key: string) => (reader.prepare("SELECT guardian_id AS id FROM guardian_keys WHERE key_hash = ?").get(hashKey(key)) as any).id;
  const ids = keys.map(idOf);
  const acked = new Map<string, number>(ids.map((id) => [id, 0]));

  // Every guardian answers right as fast as it can until the process dies.
  let stop = false;
  const answering = keys.map(async (key, i) => {
    while (!stop) {
      try {
        const p = (await (await call("/math/problem", { key })).json()) as any;
        if (!p.problem) continue;
        // Over a second of server time to think (1/60 s of real time), so the answer is not too fast (D37).
        await new Promise((r) => setTimeout(r, 30));
        const answer = (reader.prepare("SELECT answer FROM open_problems WHERE guardian_id = ?").get(ids[i]) as any)?.answer;
        const res = await call("/math/answer", { key, body: { id: p.problem.id, pick: answer } });
        if (res.status === 200) acked.set(ids[i]!, acked.get(ids[i]!)! + ((await res.json()) as any).points);
      } catch {
        // The process is gone: requests in flight fail and earn no acknowledgement.
      }
    }
  });
  await new Promise((r) => setTimeout(r, 4000));
  const before = reader.prepare("SELECT * FROM regions WHERE code = ?").get(REGION) as any;
  await kill();
  stop = true;
  await Promise.all(answering);
  expect([...acked.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(0);

  await startProcess();
  for (const id of ids) {
    const row = reader.prepare("SELECT total_points FROM guardians WHERE id = ?").get(id) as any;
    expect(row.total_points).toBeGreaterThanOrEqual(acked.get(id)!);
  }

  // The region broadcast after the restart is the log replayed from the start: same wave grid, no wave 1 again.
  const socket = connect(base, { transports: ["websocket"], auth: { key: keys[0] }, extraHeaders: { origin: ORIGIN }, reconnection: false });
  const msg = await new Promise<any>((resolve) => socket.once("region", resolve));
  socket.disconnect();
  const log = (reader.prepare("SELECT at, power FROM region_power_log WHERE region = ? ORDER BY rowid").all(REGION) as any[]).filter(
    (l) => l.at <= msg.now,
  );
  const replayed = replayStepwise(
    newRegionWaves(BigInt(log[0].at)),
    log.map((l) => ({ atMs: BigInt(l.at), power: BigInt(l.power) })),
    BigInt(msg.now),
  );
  expect(msg.waveStartMs).toBeGreaterThanOrEqual(before.wave_started_at);
  expect(BigInt(msg.waveStartMs - log[0].at) % WAVE_MS).toBe(BigInt(0));
  expect({ wave: msg.wave, waveStartMs: msg.waveStartMs, best: msg.best, breaches: msg.breaches }).toEqual({
    wave: Number(replayed.wave),
    waveStartMs: Number(replayed.waveStartMs),
    best: Number(replayed.best),
    breaches: Number(replayed.breaches),
  });
  expect(msg.best).toBeGreaterThan(1);
  reader.close();
});
