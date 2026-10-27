/* eslint-disable @typescript-eslint/no-explicit-any -- test responses and rows are read loosely */
// Test harness: a real server on a temp SQLite file, a clock the test moves, and small HTTP / socket helpers.
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { io as connect, type Socket } from "socket.io-client";
import { createGameServer, type GameServer } from "./app";

export const ORIGIN = "http://localhost:3129";
/** 2026-10-27 15:00 KST */
export const START = Date.parse("2026-10-27T06:00:00Z");

export type Harness = {
  server: GameServer;
  dbPath: string;
  baseUrl: string;
  clock: { now: () => number; set: (ms: number) => void; add: (ms: number) => void };
  api: (path: string, opts?: ApiOptions) => Promise<{ status: number; body: any }>;
  socket: (key: string | undefined, origin?: string) => Promise<{ socket: Socket; me?: any; error?: string }>;
  /** A socket that records every region and reps message from the start. */
  watch: (key: string, route?: string) => Promise<Watcher>;
  newGuardian: (fields?: Record<string, unknown>, ip?: string) => Promise<any>;
  stop: () => Promise<void>;
};

export type ApiOptions = { method?: string; body?: unknown; key?: string; ip?: string; origin?: string | null };

export type Watcher = {
  socket: Socket;
  regions: any[];
  reps: any[];
  /** Resolves with the next message of that kind (or one already waiting). */
  next: (kind: "region" | "reps") => Promise<any>;
};

export async function startServer({ rate = 1 }: { rate?: number } = {}): Promise<Harness> {
  const dir = mkdtempSync(join(tmpdir(), "ktd-server-test-"));
  const dbPath = join(dir, "test.db");
  let t = START;
  const clock = { now: () => t, set: (ms: number) => void (t = ms), add: (ms: number) => void (t += ms) };
  const server = createGameServer({
    config: { allowedOrigin: ORIGIN, serverSecret: "test-secret-0123456789abcdefghijklmnop", ipHmacKey: "test-ip-key", dbPath, flushMs: 5 },
    now: clock.now,
    rate,
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = server.httpServer.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const sockets: Socket[] = [];

  const api: Harness["api"] = async (path, { method = "GET", body, key, ip = "10.0.0.1", origin = ORIGIN } = {}) => {
    const headers: Record<string, string> = { "x-forwarded-for": ip };
    if (origin) headers.origin = origin;
    if (key) headers.authorization = `Bearer ${key}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(baseUrl + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : undefined };
  };

  const socket: Harness["socket"] = (key, origin = ORIGIN) =>
    new Promise((resolve) => {
      const s = connect(baseUrl, { transports: ["websocket"], auth: key ? { key } : {}, extraHeaders: { origin }, reconnection: false });
      sockets.push(s);
      s.on("me", (me) => resolve({ socket: s, me }));
      s.on("connect_error", (err) => resolve({ socket: s, error: err.message }));
    });

  const watch: Harness["watch"] = (key, route) =>
    new Promise((resolve, reject) => {
      const s = connect(baseUrl, { transports: ["websocket"], auth: { key, route }, extraHeaders: { origin: ORIGIN }, reconnection: false });
      sockets.push(s);
      const got = { region: [] as any[], reps: [] as any[] };
      const read = { region: 0, reps: 0 };
      const waiting: Partial<Record<"region" | "reps", (m: any) => void>> = {};
      for (const kind of ["region", "reps"] as const) {
        s.on(kind, (m) => {
          got[kind].push(m);
          const w = waiting[kind];
          if (w) {
            delete waiting[kind];
            read[kind] += 1;
            w(m);
          }
        });
      }
      const next = (kind: "region" | "reps") =>
        new Promise<any>((res) => {
          if (got[kind].length > read[kind]) res(got[kind][read[kind]++]);
          else waiting[kind] = res;
        });
      s.on("me", () => resolve({ socket: s, regions: got.region, reps: got.reps, next }));
      s.on("connect_error", (err) => reject(err));
    });

  const newGuardian: Harness["newGuardian"] = async (fields = {}, ip) => {
    const res = await api("/guardians", {
      method: "POST",
      ip,
      body: { region: "11010", nick: { adj: 0, noun: 0, tag: 427 }, towerType: "splash", ...fields },
    });
    if (res.status !== 201) throw new Error(`create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  };

  const stop = async () => {
    sockets.forEach((s) => s.disconnect());
    await server.close();
    rmSync(dir, { recursive: true, force: true });
  };

  return { server, dbPath, baseUrl, clock, api, socket, watch, newGuardian, stop };
}
