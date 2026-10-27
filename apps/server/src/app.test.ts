/* eslint-disable @typescript-eslint/no-explicit-any -- test responses and rows are read loosely */
import { formatRecoveryCode, STATS, WAVE_MS } from "@ktd/core";
import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DAY_MS, HOUR_MS, kstMidnight } from "./dates";
import { hashKey } from "./guardians";
import { startServer, type Harness } from "./test-server";

let h: Harness;

beforeEach(async () => {
  h = await startServer();
});

afterEach(async () => {
  await h.stop();
});

const regionRow = (code: string) => h.server.db.prepare("SELECT * FROM regions WHERE code = ?").get(code) as any;
const guardianCount = () => (h.server.db.prepare("SELECT COUNT(*) AS n FROM guardians").get() as { n: number }).n;

describe("http basics", () => {
  it("answers /health with 200 and unknown paths with 404", async () => {
    expect(await h.api("/health", { origin: null })).toEqual({ status: 200, body: { ok: true, sockets: { domain: 0, ip: 0, proxy: 0 } } });
    expect((await h.api("/nope")).status).toBe(404);
  });

  it("refuses requests from any other origin or with none (D77)", async () => {
    expect((await h.api("/nicks", { origin: "https://evil.example" })).status).toBe(403);
    expect((await h.api("/nicks", { origin: null })).status).toBe(403);
    const ok = await fetch(`${h.baseUrl}/nicks`, { headers: { origin: "http://localhost:3129" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3129");
  });

  it("answers the CORS preflight for the allowed origin only", async () => {
    const pre = (origin: string) =>
      fetch(`${h.baseUrl}/me/nick`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type" },
      });
    expect((await pre("http://localhost:3129")).status).toBe(204);
    expect((await pre("https://evil.example")).status).toBe(403);
  });

  it("refuses sockets from another origin", async () => {
    const { key } = await h.newGuardian();
    expect((await h.socket(key, "https://evil.example")).error).toBeDefined();
  });
});

describe("new guardian and nicknames (D1, D3)", () => {
  it("hands out three nickname candidates from the word lists", async () => {
    const { status, body } = await h.api("/nicks");
    expect(status).toBe(200);
    expect(body.candidates).toHaveLength(3);
  });

  it("makes a guardian and returns its key, a code shown once, and my state", async () => {
    const made = await h.newGuardian();
    expect(made.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(made.code.words).toHaveLength(4);
    expect(made.code.digits).toMatch(/^\d\d$/);
    expect(made.me).toMatchObject({
      name: "씩씩한 수달",
      tag: "0427",
      region: "11010",
      towerType: "splash",
      level: "1",
      points: "0",
      stage: "1",
      regionChange: { allowed: true, nextOn: null },
    });
    // Nothing on /me gives the code back.
    const me = await h.api("/me", { key: made.key });
    expect(me.status).toBe(200);
    expect(JSON.stringify(me.body)).not.toContain(made.code.words[0]);
  });

  it("refuses nickname numbers outside the lists, unknown regions and tower types", async () => {
    const base = { region: "11010", nick: { adj: 0, noun: 0, tag: 1 }, towerType: "rapid" };
    const bad = [
      { nick: { adj: 9999, noun: 0, tag: 1 } },
      { nick: { adj: 0, noun: -1, tag: 1 } },
      { nick: { adj: 0, noun: 0, tag: 10000 } },
      { nick: { adj: 0.5, noun: 0, tag: 1 } },
      { nick: "씩씩한 수달" },
      { region: "99999" },
      { towerType: "laser" },
    ];
    for (const fields of bad) {
      expect((await h.api("/guardians", { method: "POST", body: { ...base, ...fields } })).status).toBe(400);
    }
    expect(guardianCount()).toBe(0);
  });

  it("keeps no grade band: none in my state or the database, no /me/band, a band sent along is ignored (spec 4판)", async () => {
    const { key, me } = await h.newGuardian({ band: "56" });
    expect(me).not.toHaveProperty("band");
    expect((await h.api("/me/band", { method: "POST", key, body: { band: "12" } })).status).toBe(404);
    for (const table of ["guardians", "open_problems"]) {
      const columns = (h.server.db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
      expect(columns, table).not.toContain("band");
    }
  });

  it("changes the nickname to another list nickname only", async () => {
    const { key } = await h.newGuardian();
    expect((await h.api("/me/nick", { method: "POST", key, body: { nick: { adj: 1, noun: 2, tag: 5 } } })).body.me).toMatchObject({
      name: "반짝이는 고래",
      tag: "0005",
    });
    expect((await h.api("/me/nick", { method: "POST", key, body: { nick: { adj: 1, noun: 999, tag: 5 } } })).status).toBe(400);
  });
});

describe("device key (D6, D54)", () => {
  it("keeps me across visits with the same key, and refuses missing, made-up or foreign keys", async () => {
    const a = await h.newGuardian();
    expect((await h.api("/me", { key: a.key })).body.me.name).toBe("씩씩한 수달");
    expect((await h.api("/me")).status).toBe(401);
    expect((await h.api("/me", { key: "x".repeat(43) })).status).toBe(401);
    expect((await h.api("/me", { key: "short" })).status).toBe(401);
  });

  it("ignores points, stage, power and wave values sent by the screen (D54)", async () => {
    const made = await h.newGuardian({ points: 999999, stage: 500, level: 99, power: "1000000", wave: 777, id: "someone" });
    expect(made.me).toMatchObject({ points: "0", stage: "1", level: "1", power: "10" });
    const res = await h.api("/me/nick", { method: "POST", key: made.key, body: { nick: { adj: 1, noun: 2, tag: 5 }, points: 5, stage: 3 } });
    expect(res.body.me).toMatchObject({ points: "0", stage: "1" });
    await h.server.flushPower();
    expect(regionRow("11010").next_power).toBe("10");
  });

  it("acts only on the guardian of the key, whatever ids the body carries", async () => {
    const a = await h.newGuardian();
    const b = await h.newGuardian({ nick: { adj: 3, noun: 3, tag: 3 } });
    await h.api("/me/nick", { method: "POST", key: a.key, body: { id: "b", nick: { adj: 5, noun: 5, tag: 5 } } });
    expect((await h.api("/me", { key: b.key })).body.me.tag).toBe("0003");
  });

  it("lets sockets in with a guardian's key only (D54)", async () => {
    const a = await h.newGuardian();
    const ok = await h.socket(a.key);
    expect(ok.error).toBeUndefined();
    expect(ok.me.name).toBe("씩씩한 수달");
    expect((await h.socket("y".repeat(43))).error).toBe("no_guardian");
    expect((await h.socket(undefined)).error).toBe("no_guardian");
  });
});

describe("recovery code (D4, D5)", () => {
  it("continues the same guardian in another browser with a new key; the first key keeps working", async () => {
    const a = await h.newGuardian({ region: "32540" });
    // Progress the guardian as the problem server will (T12).
    h.server.db.prepare("UPDATE guardians SET total_points = 1234, wallet = 7, level = 6, stage = 12, tendency = 'luck'").run();
    const before = (await h.api("/me", { key: a.key })).body.me;
    const res = await h.api("/restore", { method: "POST", body: a.code, ip: "10.0.0.2" });
    expect(res.status).toBe(200);
    expect(res.body.key).not.toBe(a.key);
    expect(res.body.me).toEqual(before);
    expect(before).toMatchObject({ name: "씩씩한 수달", region: "32540", level: "6", points: "1234", stage: "12" });
    expect(before.stats).toEqual({ power: "1", speed: "1", range: "1", luck: "2" });
    expect((await h.api("/me", { key: a.key })).status).toBe(200);
    expect((await h.api("/me", { key: res.body.key })).body.me).toEqual(before);
  });

  it("a new code replaces the old one at once", async () => {
    const a = await h.newGuardian();
    const res = await h.api("/me/code", { method: "POST", key: a.key });
    expect(res.status).toBe(200);
    expect(formatRecoveryCode(res.body.code)).not.toBe(formatRecoveryCode(a.code));
    expect((await h.api("/restore", { method: "POST", body: a.code })).status).toBe(401);
    expect((await h.api("/restore", { method: "POST", body: res.body.code })).status).toBe(200);
  });

  it("refuses codes that are not list words and two digits", async () => {
    for (const body of [{ words: ["가방", "가위", "가지"], digits: "12" }, { words: ["a", "b", "c", "d"], digits: "12" }, { words: ["가방", "가위", "가지", "가을"], digits: "123" }]) {
      expect((await h.api("/restore", { method: "POST", body })).status).toBe(400);
    }
  });

  it("locks an address for an hour on the 10th wrong code, even for the right code (D5)", async () => {
    const a = await h.newGuardian();
    const wrong = { words: ["가방", "가위", "가지", "가을"], digits: a.code.digits === "00" ? "01" : "00" };
    for (let i = 1; i <= 9; i++) {
      const res = await h.api("/restore", { method: "POST", body: wrong, ip: "10.9.9.9" });
      expect(res).toEqual({ status: 401, body: { error: "bad_code", triesLeft: 10 - i } });
    }
    expect((await h.api("/restore", { method: "POST", body: wrong, ip: "10.9.9.9" })).body).toEqual({ error: "locked", minutesLeft: 60 });
    h.clock.add(30 * 60_000);
    expect((await h.api("/restore", { method: "POST", body: a.code, ip: "10.9.9.9" })).body).toEqual({ error: "locked", minutesLeft: 30 });
    // Another address is not affected.
    expect((await h.api("/restore", { method: "POST", body: a.code, ip: "10.8.8.8" })).status).toBe(200);
    h.clock.add(30 * 60_000);
    expect((await h.api("/restore", { method: "POST", body: a.code, ip: "10.9.9.9" })).status).toBe(200);
  });

  it("counts concurrent tries from one address one by one, so none gets past the lock (D5)", async () => {
    const a = await h.newGuardian();
    const wrong = { words: ["가방", "가위", "가지", "가을"], digits: a.code.digits === "00" ? "01" : "00" };
    const send = (body: unknown) => h.api("/restore", { method: "POST", body, ip: "10.7.7.7" });
    const first = await Promise.all(Array.from({ length: 15 }, () => send(wrong)));
    expect(first.filter((r) => r.status === 401)).toHaveLength(9);
    expect(first.filter((r) => r.status === 429)).toHaveLength(6);
    const second = await Promise.all([...Array.from({ length: 5 }, () => send(wrong)), send(a.code), send(a.code)]);
    expect(second.map((r) => r.status)).toEqual([429, 429, 429, 429, 429, 429, 429]);
    // Still an hour from the 10th failure, not from the later ones.
    h.clock.add(HOUR_MS);
    expect((await send(a.code)).status).toBe(200);
  });

  it("keeps no key or code in the database files, only hashes (D4)", async () => {
    const a = await h.newGuardian();
    const b = await h.api("/restore", { method: "POST", body: a.code });
    const fresh = await h.api("/me/code", { method: "POST", key: a.key });
    const secrets = [a.key, b.body.key, formatRecoveryCode(a.code), formatRecoveryCode(fresh.body.code), a.code.words.join(""), fresh.body.code.words.join("")];

    // Every value in every table.
    const db = h.server.db;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const dump = tables.map(({ name }) => JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all())).join("\n");
    // And the raw bytes of the DB file and its WAL.
    const dir = dirname(h.dbPath);
    const raw = readdirSync(dir).map((f) => readFileSync(join(dir, f)).toString("utf8")).join("\n");
    for (const s of secrets) {
      expect(dump).not.toContain(s);
      expect(raw).not.toContain(s);
    }
  });
});

describe("new guardian limit per address (D40)", () => {
  it("refuses the 61st new guardian from one address within an hour", async () => {
    for (let i = 0; i < 60; i++) await h.newGuardian({}, "10.1.1.1");
    const res = await h.api("/guardians", {
      method: "POST",
      ip: "10.1.1.1",
      body: { region: "11010", nick: { adj: 0, noun: 0, tag: 1 }, towerType: "rapid" },
    });
    expect(res).toEqual({ status: 429, body: { error: "too_many_guardians" } });
    await h.newGuardian({}, "10.1.1.2");
    h.clock.add(HOUR_MS);
    await h.newGuardian({}, "10.1.1.1");
  });
});

describe("region change (D7)", () => {
  const change = (key: string, region: string) => h.api("/me/region", { method: "POST", key, body: { region } });

  it("allows one change within 24 hours, then shows the next possible day", async () => {
    const { key } = await h.newGuardian({ region: "11010" });
    h.clock.add(DAY_MS - 1);
    const first = await change(key, "32540");
    expect(first.status).toBe(200);
    expect(first.body.me).toMatchObject({ region: "32540", regionChange: { allowed: false, nextOn: "2026-11-27" } });
    const again = await change(key, "11020");
    expect(again).toEqual({ status: 409, body: { error: "region_locked", nextOn: "2026-11-27" } });
  });

  it("after 24 hours waits 30 days from the first pick: blocked just before, open just after", async () => {
    const { key } = await h.newGuardian({ region: "11010" });
    h.clock.add(DAY_MS);
    expect(await change(key, "32540")).toEqual({ status: 409, body: { error: "region_locked", nextOn: "2026-11-26" } });
    h.clock.set(kstMidnight("2026-11-26") - 1);
    expect((await change(key, "32540")).status).toBe(409);
    h.clock.set(kstMidnight("2026-11-26"));
    expect((await change(key, "32540")).status).toBe(200);
  });

  it("refuses the same region and unknown regions", async () => {
    const { key } = await h.newGuardian({ region: "11010" });
    expect((await change(key, "11010")).body).toEqual({ error: "same_region" });
    expect((await change(key, "00000")).status).toBe(400);
  });

  it("moves my power from the old region to the new one from the next wave; record and old best wave stay", async () => {
    const { key } = await h.newGuardian({ region: "11010" });
    await h.newGuardian({ region: "11010" });
    await h.server.flushPower();
    // The old region fights a few waves with both guardians first.
    h.clock.add(Number(WAVE_MS) * 3 + 1000);
    await h.api("/me", { key });
    // Points earned so far (the problem server adds them from T12; they do not change the power).
    h.server.db
      .prepare("UPDATE guardians SET total_points = 300, wallet = 4 WHERE id = (SELECT guardian_id FROM guardian_keys WHERE key_hash = ?)")
      .run(hashKey(key));
    const me = (await h.api("/me", { key })).body.me;
    expect((await change(key, "32540")).status).toBe(200);
    // Applied with the next pool flush (every 10 s), from the wave after.
    await h.server.flushPower();
    const old = regionRow("11010");
    const fresh = regionRow("32540");
    // The wave in progress keeps the power it started with; the next waves use the new sums.
    expect(old).toMatchObject({ power: "20", next_power: "10", guardian_count: 1 });
    expect(fresh).toMatchObject({ next_power: me.power, guardian_count: 1 });
    expect(old.best_wave).toBe(2);
    const after = (await h.api("/me", { key })).body.me;
    expect(after).toMatchObject({ ...me, region: "32540", regionChange: after.regionChange });
    expect(after).toMatchObject({ points: "300", wallet: "4" });
  });
});

describe("making a guardian again from the code screen (T13-2)", () => {
  it("drops this device's previous guardian whose code was never used, from the region count and power too", async () => {
    const old = await h.newGuardian({ region: "11010" });
    await h.server.flushPower();
    expect(regionRow("11010")).toMatchObject({ guardian_count: 1, next_power: "10" });
    const again = await h.newGuardian({ region: "11010", replaceKey: old.key });
    await h.server.flushPower();
    expect(guardianCount()).toBe(1);
    expect(regionRow("11010")).toMatchObject({ guardian_count: 1, next_power: again.me.power });
    expect(again.me.power).toBe("10");
    expect((await h.api("/me", { key: old.key })).status).toBe(401);
    expect((await h.api("/restore", { method: "POST", body: old.code })).status).toBe(401);
  });

  it("works across regions: the old region loses the guardian, the new one gains it", async () => {
    const old = await h.newGuardian({ region: "11010" });
    await h.server.flushPower();
    await h.newGuardian({ region: "32540", replaceKey: old.key });
    await h.server.flushPower();
    expect(regionRow("11010")).toMatchObject({ guardian_count: 0, next_power: "0" });
    expect(regionRow("32540")).toMatchObject({ guardian_count: 1, next_power: "10" });
  });

  it("keeps a guardian whose code has been used on another device", async () => {
    const old = await h.newGuardian();
    await h.api("/restore", { method: "POST", body: old.code, ip: "10.0.0.2" });
    await h.newGuardian({ replaceKey: old.key });
    await h.server.flushPower();
    expect(guardianCount()).toBe(2);
    expect(regionRow("11010").guardian_count).toBe(2);
    expect((await h.api("/me", { key: old.key })).status).toBe(200);
  });

  it("ignores unknown or made-up keys and still makes the new guardian", async () => {
    const other = await h.newGuardian();
    for (const replaceKey of ["q".repeat(43), "short", 12, null]) await h.newGuardian({ replaceKey });
    expect(guardianCount()).toBe(5);
    expect((await h.api("/me", { key: other.key })).status).toBe(200);
  });
});

describe("my tower looks: type, tendency, colour (T13-2)", () => {
  const look = (key: string, body: unknown) => h.api("/me/look", { method: "POST", key, body });
  const setLevel = (key: string, level: number) =>
    h.server.db
      .prepare("UPDATE guardians SET level = ? WHERE id = (SELECT guardian_id FROM guardian_keys WHERE key_hash = ?)")
      .run(level, hashKey(key));

  it("saves the picks so a reload and another device after restore show them", async () => {
    const a = await h.newGuardian();
    setLevel(a.key, 23);
    const res = await look(a.key, { towerType: "slow", tendency: "range", color: 2 });
    expect(res.status).toBe(200);
    expect(res.body.me).toMatchObject({ towerType: "slow", tendency: "range", color: 2 });
    expect((await h.api("/me", { key: a.key })).body.me).toMatchObject({ towerType: "slow", tendency: "range", color: 2 });
    const other = await h.api("/restore", { method: "POST", body: a.code, ip: "10.0.0.2" });
    expect(other.body.me).toMatchObject({ towerType: "slow", tendency: "range", color: 2 });
    // One field at a time leaves the others as they are.
    expect((await look(a.key, { color: 0 })).body.me).toMatchObject({ towerType: "slow", tendency: "range", color: 0 });
  });

  it("re-splits the stats when the tendency changes; the stat sum and power stay (D46, D47)", async () => {
    const { key } = await h.newGuardian();
    setLevel(key, 11);
    await h.server.flushPower();
    const before = (await h.api("/me", { key })).body.me;
    const after = (await look(key, { tendency: "speed", towerType: "rapid" })).body.me;
    expect(before.stats).toEqual({ power: "3", speed: "3", range: "2", luck: "2" });
    expect(after.stats).toEqual({ power: "2", speed: "4", range: "2", luck: "2" });
    expect(after.power).toBe(before.power);
    await h.server.flushPower();
    expect(regionRow("11010").next_power).toBe("10");
  });

  it("names the stats like the core tendencies, so a one-stat tendency raises the stat of the same name", async () => {
    const { key } = await h.newGuardian();
    setLevel(key, 11);
    for (const stat of STATS) {
      const { stats } = (await look(key, { tendency: stat })).body.me;
      expect(Object.keys(stats).sort()).toEqual([...STATS].sort());
      expect(stats[stat]).toBe("4");
    }
  });

  it("refuses a colour that is not open yet, whatever level the screen sends", async () => {
    const { key } = await h.newGuardian();
    setLevel(key, 9);
    expect(await look(key, { color: 1, level: 50 })).toEqual({ status: 409, body: { error: "color_locked" } });
    expect((await h.api("/me", { key })).body.me).toMatchObject({ level: "9", color: 0 });
    setLevel(key, 10);
    expect((await look(key, { color: 1, level: 1 })).body.me).toMatchObject({ level: "10", color: 1 });
    expect((await look(key, { color: 2 })).status).toBe(409);
  });

  it("refuses values out of range and a body with nothing to change", async () => {
    const { key } = await h.newGuardian();
    setLevel(key, 500);
    for (const body of [{}, { color: 12 }, { color: -1 }, { color: 1.5 }, { color: "1" }, { tendency: "pow" }, { towerType: "laser" }, { level: 3 }]) {
      expect((await look(key, body)).status).toBe(400);
    }
    // A bad field refuses the whole change.
    expect((await look(key, { towerType: "slow", color: 99 })).status).toBe(400);
    expect((await h.api("/me", { key })).body.me).toMatchObject({ towerType: "splash", tendency: "balanced", color: 0 });
  });

  it("changes only the guardian of the key, and refuses made-up keys", async () => {
    const a = await h.newGuardian();
    const b = await h.newGuardian({ nick: { adj: 3, noun: 3, tag: 3 } });
    await look(a.key, { id: "b", rid: b.me.rid, towerType: "slow" });
    expect((await h.api("/me", { key: b.key })).body.me.towerType).toBe("splash");
    expect((await h.api("/me", { key: a.key })).body.me.towerType).toBe("slow");
    expect((await look("z".repeat(43), { towerType: "rapid" })).status).toBe(401);
    expect((await look("", { towerType: "rapid" })).status).toBe(401);
  });
});

describe("delete my record (D8)", () => {
  it("removes the row, takes my power out from the next wave, and kills key and code", async () => {
    const a = await h.newGuardian({ region: "11010" });
    await h.server.flushPower();
    expect(regionRow("11010")).toMatchObject({ next_power: "10", guardian_count: 1 });
    const restored = await h.api("/restore", { method: "POST", body: a.code });
    const sock = await h.socket(a.key);
    const gone = new Promise((resolve) => sock.socket.on("disconnect", resolve));
    expect((await h.api("/me", { method: "DELETE", key: a.key })).status).toBe(204);
    await gone;
    await h.server.flushPower();
    expect(guardianCount()).toBe(0);
    expect((h.server.db.prepare("SELECT COUNT(*) AS n FROM guardian_keys").get() as any).n).toBe(0);
    expect(regionRow("11010")).toMatchObject({ next_power: "0", guardian_count: 0 });
    expect((await h.api("/me", { key: a.key })).status).toBe(401);
    expect((await h.api("/me", { key: restored.body.key })).status).toBe(401);
    expect((await h.api("/restore", { method: "POST", body: a.code })).status).toBe(401);
    expect((await h.socket(a.key)).error).toBe("no_guardian");
  });

  it("changes nothing until the delete request comes (cancel is screen-only)", async () => {
    const a = await h.newGuardian();
    expect((await h.api("/me", { key: a.key })).status).toBe(200);
    expect(guardianCount()).toBe(1);
  });
});

describe("365-day clean-up (D76)", () => {
  it("removes guardians unseen for 365 days and takes their power out from the next wave", async () => {
    const stale = await h.newGuardian({ region: "11010" });
    const active = await h.newGuardian({ region: "11010", nick: { adj: 2, noun: 2, tag: 2 } });
    // Last seen 2026-10-27. The active one comes back on day 200.
    h.clock.set(kstMidnight("2027-05-15") + 1000);
    await h.api("/me", { key: active.key });
    h.clock.set(kstMidnight("2027-10-27") - 1);
    await h.server.maintenance();
    expect(guardianCount()).toBe(2);
    h.clock.set(kstMidnight("2027-10-27"));
    await h.server.maintenance();
    expect(guardianCount()).toBe(1);
    expect((await h.api("/me", { key: stale.key })).status).toBe(401);
    expect((await h.api("/me", { key: active.key })).status).toBe(200);
    expect(regionRow("11010")).toMatchObject({ next_power: "10", guardian_count: 1 });
  });

  it("keeps the last visit as a day only", async () => {
    const a = await h.newGuardian();
    h.clock.add(3 * DAY_MS);
    await h.api("/me", { key: a.key });
    expect((h.server.db.prepare("SELECT last_seen_on FROM guardians").get() as any).last_seen_on).toBe("2026-10-30");
  });
});

describe("privacy (D69, D77)", () => {
  it("has no IP, user agent, device or minute-level visit columns", () => {
    const db = h.server.db;
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    const columns = tables.flatMap(({ name }) => (db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string }[]).map((c) => `${name}.${c.name}`));
    expect(columns.length).toBeGreaterThan(10);
    const forbidden = /(^|[._])(ip|ips|ip_?addr\w*|address|addr|user_?agent|ua|agent|device\w*|browser\w*|platform|os|last_seen_at|seen_at|visited_at|login\w*)$/i;
    expect(columns.filter((c) => forbidden.test(c))).toEqual([]);
    // The only visit field is a day.
    expect(columns).toContain("guardians.last_seen_on");
  });

  it("writes no nickname, key, code or address to the log", async () => {
    const lines: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => void lines.push(args.map(String).join(" "))),
    );
    try {
      const a = await h.newGuardian({}, "203.0.113.77");
      await h.api("/restore", { method: "POST", body: a.code, ip: "203.0.113.77" });
      await h.api("/restore", { method: "POST", body: { words: ["가방", "가위", "가지", "가을"], digits: "00" }, ip: "203.0.113.77" });
      await h.api("/me/code", { method: "POST", key: a.key });
      await h.socket(a.key);
      await h.api("/me", { method: "DELETE", key: a.key });
      const log = lines.join("\n");
      for (const s of [a.key, formatRecoveryCode(a.code), "씩씩한", "203.0.113.77"]) expect(log).not.toContain(s);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});

describe("restart", () => {
  it("keeps guardians and regions in the file across a restart", async () => {
    const a = await h.newGuardian();
    const db = new Database(h.dbPath, { readonly: true });
    expect((db.prepare("SELECT COUNT(*) AS n FROM guardians").get() as any).n).toBe(1);
    db.close();
    expect((await h.api("/me", { key: a.key })).status).toBe(200);
  });
});
