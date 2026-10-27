/* eslint-disable @typescript-eslint/no-explicit-any -- test responses and rows are read loosely */
// Region rooms: pooled power, wave results, representatives and the one-a-second broadcast (D21, D22, D23, D25, D77).
import { newRegionWaves, placeTowers, replayStepwise, WAVE_MS, type Guardian } from "@ktd/core";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { HOUR_MS, kstDate } from "./dates";
import { hashKey, publicId } from "./guardians";
import { MAX_REP_SPOTS, REPS_EVERY_MS } from "./live";
import { START, startServer, type Harness } from "./test-server";

let h: Harness;

afterEach(async () => {
  await h.stop();
});

const W = Number(WAVE_MS);
const db = () => h.server.db;
const idOf = (key: string): string =>
  (db().prepare("SELECT guardian_id AS id FROM guardian_keys WHERE key_hash = ?").get(hashKey(key)) as any).id;
const regionRow = (code: string) => db().prepare("SELECT * FROM regions WHERE code = ?").get(code) as any;

/** Answer my open problem right after 4 s of thinking. */
async function solveRight(key: string) {
  const { body } = await h.api("/math/problem", { key });
  h.clock.add(4000);
  const answer = (db().prepare("SELECT answer FROM open_problems WHERE guardian_id = ?").get(idOf(key)) as any).answer;
  return (await h.api("/math/answer", { method: "POST", key, body: { id: body.problem.id, pick: answer } })).body;
}

/** Guardians written straight into the database (a big fake region), with points this hour. */
function seedGuardians(region: string, list: { points: number; stage?: number; pickedAt?: number }[]): string[] {
  const insert = db().prepare(
    `INSERT INTO guardians (id, code_hash, nick_adj, nick_noun, nick_tag, band, region, region_picked_at, tower_type, stage, last_seen_on)
     VALUES (?, ?, 1, 2, ?, '34', ?, ?, 'rapid', ?, ?)`,
  );
  const points = db().prepare("INSERT INTO guardian_points_hourly (guardian_id, hour, points) VALUES (?, ?, ?)");
  const ids: string[] = [];
  db().transaction(() => {
    list.forEach((g, i) => {
      const id = randomBytes(16).toString("base64url");
      insert.run(id, randomBytes(16).toString("base64url"), i % 10_000, region, g.pickedAt ?? START + i, g.stage ?? 1, kstDate(START));
      if (g.points > 0) points.run(id, Math.floor(h.clock.now() / HOUR_MS), g.points);
      ids.push(id);
    });
  })();
  return ids;
}

const asGuardians = (list: any[]): Guardian[] =>
  list.map((r, joinedAt) => ({ id: r.rid, nick: "", tag: String(r.tag), type: r.type, step: r.step, pal: r.pal, pts24: r.pts24, joinedAt }));

describe("region power, pooled every 10 seconds", () => {
  it("writes the region row once per flush however many guardians changed, from the next wave", async () => {
    h = await startServer();
    for (let i = 0; i < 5; i++) await h.newGuardian({ region: "11020" }, `10.0.0.${i}`);
    expect(regionRow("11020")).toBeUndefined();
    await h.server.flushPower();
    expect(regionRow("11020")).toMatchObject({ next_power: "50", guardian_count: 5 });
    expect((db().prepare("SELECT COUNT(*) AS n FROM region_power_log WHERE region = '11020'").get() as any).n).toBe(1);
  });

  it("flushes on its own every 10 s of server time", async () => {
    h = await startServer({ rate: 1000 });
    await h.newGuardian({ region: "11020" });
    await expect.poll(() => regionRow("11020")?.next_power, { timeout: 2000 }).toBe("10");
  });

  it("puts the region right from its guardians after a restart lost the pool", async () => {
    h = await startServer();
    await h.newGuardian({ region: "11020" });
    await h.newGuardian({ region: "11020" }, "10.0.0.9");
    // The pool is lost (as if the process was killed); the start-up check finds the region from the guardian rows.
    await h.server.maintenance();
    expect(regionRow("11020")).toMatchObject({ next_power: "20", guardian_count: 2 });
  });
});

describe("the region broadcast (D23, D25)", () => {
  it("sends the wave in progress at once, then every ended wave once, matching a wave-by-wave replay of the log", async () => {
    h = await startServer();
    const a = await h.newGuardian({ region: "11020" });
    await h.newGuardian({ region: "11020" }, "10.0.0.2");
    await h.server.flushPower();
    const w = await h.watch(a.key);
    const first = await w.next("region");
    expect(first).toMatchObject({ code: "11020", wave: 1, waveStartMs: START, ended: [], guardians: 2, online: 1, rate: 1 });

    for (let i = 0; i < 40; i++) {
      h.clock.add(W);
      // Power changes mid-way: my tower grows (pooled, then applied).
      if (i === 12) await solveRight(a.key);
      if (i === 13) await h.server.flushPower();
      await h.server.live.tickAll();
    }
    await expect.poll(() => w.regions.at(-1)?.now).toBe(h.clock.now());
    const shown = w.regions.flatMap((m) => m.ended);

    const log = db().prepare("SELECT at, power FROM region_power_log WHERE region = '11020' ORDER BY rowid").all() as any[];
    const replayed: { wave: number; held: boolean }[] = [];
    replayStepwise(
      newRegionWaves(BigInt(log[0].at)),
      log.map((l) => ({ atMs: BigInt(l.at), power: BigInt(l.power) })),
      BigInt(h.clock.now()),
      (s) => void replayed.push({ wave: Number(s.wave), held: s.blocked }),
    );
    expect(shown.map(({ wave, held }) => ({ wave, held }))).toEqual(replayed);
    expect(shown.some((e) => !e.held)).toBe(true);
    expect(shown.some((e) => e.held)).toBe(true);
    // The wave on screen after each message is the server's stored wave.
    expect(w.regions.at(-1).wave).toBe(regionRow("11020").wave);
  });

  it("sends one message per tick only when something changed, with the right answers since the last tick, under 2 KB", async () => {
    h = await startServer();
    const a = await h.newGuardian({ region: "11020" });
    const b = await h.newGuardian({ region: "11020" }, "10.0.0.2");
    const w = await h.watch(a.key);
    await w.next("region");
    const delivered = () => new Promise((r) => setTimeout(r, 40));
    await h.server.live.tickAll();
    await delivered();
    const before = w.regions.length;
    for (let i = 0; i < 3; i++) {
      await solveRight(a.key);
      await solveRight(b.key);
    }
    await h.server.live.tickAll();
    await delivered();
    const sent = w.regions.slice(before);
    // Six right answers, however many ticks (the real one-second timer may have run too) carried them.
    expect(sent.reduce((sum, m) => sum + m.perSec, 0)).toBe(6);
    for (const m of sent) expect(Buffer.byteLength(JSON.stringify(m))).toBeLessThan(2048);
    // Nothing changes any more: ticks send nothing.
    await h.server.live.tickAll();
    await delivered();
    const quiet = w.regions.length;
    await h.server.live.tickAll();
    await h.server.live.tickAll();
    await delivered();
    expect(w.regions.length).toBe(quiet);
  });

  it("counts the watching guardians and moves my sockets when I change region", async () => {
    h = await startServer();
    const a = await h.newGuardian({ region: "11020" });
    const w1 = await h.watch(a.key);
    const w2 = await h.watch(a.key);
    expect((await w2.next("region")).online).toBe(1);
    expect((await h.api("/me/region", { method: "POST", key: a.key, body: { region: "11030" } })).status).toBe(200);
    await expect.poll(() => w1.regions.at(-1)?.code).toBe("11030");
    expect(w2.regions.at(-1)).toMatchObject({ code: "11030", online: 1 });
  });
});

describe("connection routes on /health (D77)", () => {
  it("counts sockets by the way they came, numbers only", async () => {
    h = await startServer();
    const a = await h.newGuardian();
    await h.watch(a.key, "ip");
    const p = await h.watch(a.key, "proxy");
    await h.watch(a.key, "made-up");
    expect((await h.api("/health", { origin: null })).body).toEqual({ ok: true, sockets: { domain: 1, ip: 1, proxy: 1 } });
    p.socket.disconnect();
    await expect.poll(async () => (await h.api("/health", { origin: null })).body.sockets.proxy).toBe(0);
  });
});

describe("representatives (D21)", () => {
  it("picks by 24-hour points, then tower step, then who came first; again only every 10 minutes", async () => {
    h = await startServer();
    const me = await h.newGuardian({ region: "11030" });
    const [low, tieLate, tieHigh, top, none] = seedGuardians("11030", [
      { points: 10 },
      { points: 30, stage: 4, pickedAt: START + 50 },
      { points: 30, stage: 9, pickedAt: START + 90 },
      { points: 80 },
      { points: 0, stage: 300 },
    ]);
    const tieEarly = seedGuardians("11030", [{ points: 30, stage: 4, pickedAt: START + 10 }])[0]!;
    const w = await h.watch(me.key);
    const order = (m: any) => m.list.map((r: any) => r.rid);
    const rid = publicId;
    expect(order(await w.next("reps"))).toEqual([rid(top!), rid(tieHigh!), rid(tieEarly), rid(tieLate!), rid(low!)]);
    expect(order(w.reps[0])).not.toContain(rid(none!));

    // More points for the lowest one: nothing moves before the 10 minutes are up.
    db().prepare("UPDATE guardian_points_hourly SET points = 500 WHERE guardian_id = ?").run(low);
    h.clock.add(REPS_EVERY_MS - 1000);
    await h.server.live.tickAll();
    await new Promise((r) => setTimeout(r, 40));
    expect(w.reps).toHaveLength(1);
    h.clock.add(1000);
    await h.server.live.tickAll();
    expect(order(await w.next("reps"))[0]).toBe(rid(low!));

    // A day later nobody earned anything in the last 24 hours: every spot is empty.
    h.clock.add(25 * HOUR_MS);
    await h.server.live.tickAll();
    expect((await w.next("reps")).list).toEqual([]);
  });
});

describe("my tower is always drawn (D22)", () => {
  it("draws at most N + 1 towers in a region of 1,000 guardians, mine on my spot or on my representative spot", async () => {
    h = await startServer();
    const mine = await h.newGuardian({ region: "11040" });
    seedGuardians(
      "11040",
      Array.from({ length: 1000 }, (_, i) => ({ points: i % 3 === 0 ? 0 : 1 + ((i * 7919) % 900), stage: 1 + (i % 50) })),
    );
    const n = 8; // the test stage's representative spots
    const w = await h.watch(mine.key);
    const reps = (await w.next("reps")).list;
    expect(reps).toHaveLength(MAX_REP_SPOTS);
    const me: Guardian = { id: mine.me.rid, nick: "나", tag: mine.me.tag, type: "splash", step: 1, pal: 0, pts24: 0, joinedAt: 0 };
    const placed = placeTowers(asGuardians(reps), me, n);
    expect(placed).toHaveLength(n + 1);
    expect(placed.filter((t) => t.me)).toEqual([expect.objectContaining({ spot: "mine" })]);

    // I earn the most: at the next pick I take the first representative spot and my own spot goes.
    db().prepare("INSERT INTO guardian_points_hourly (guardian_id, hour, points) VALUES (?, ?, 5000)").run(idOf(mine.key), Math.floor(h.clock.now() / HOUR_MS));
    h.clock.add(REPS_EVERY_MS);
    await h.server.live.tickAll();
    const again = (await w.next("reps")).list;
    expect(again[0].rid).toBe(mine.me.rid);
    const placedAgain = placeTowers(asGuardians(again), me, n);
    expect(placedAgain.length).toBeLessThanOrEqual(n + 1);
    expect(placedAgain.filter((t) => t.me)).toEqual([expect.objectContaining({ spot: "rep", index: 0 })]);
  });
});
