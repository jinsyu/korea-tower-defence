/* eslint-disable @typescript-eslint/no-explicit-any -- test responses and rows are read loosely */
import { generateProblem, WAVE_MS } from "@ktd/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DAY_MS, kstDate, kstMidnight } from "./dates";
import { hashKey } from "./guardians";
import { freshSeed, levelSeeds } from "./math";
import { startServer, type Harness } from "./test-server";

let h: Harness;

beforeEach(async () => {
  h = await startServer();
});

afterEach(async () => {
  await h.stop();
});

const guardianOf = (key: string) =>
  h.server.db.prepare("SELECT g.* FROM guardians g JOIN guardian_keys k ON k.guardian_id = g.id WHERE k.key_hash = ?").get(hashKey(key)) as any;
/** The answer the server keeps for my open problem (never sent with the problem). */
const answerOf = (key: string): number =>
  (h.server.db.prepare("SELECT answer FROM open_problems WHERE guardian_id = ?").get(guardianOf(key).id) as any).answer;
const setGuardian = (key: string, fields: Record<string, unknown>) => {
  const sets = Object.keys(fields).map((k) => `${k} = @${k}`).join(", ");
  h.server.db.prepare(`UPDATE guardians SET ${sets} WHERE id = @id`).run({ ...fields, id: guardianOf(key).id });
};

const getProblem = (key: string) => h.api("/math/problem", { key });
const answer = (key: string, id: string, pick: number, extra: Record<string, unknown> = {}) =>
  h.api("/math/answer", { method: "POST", key, body: { id, pick, ...extra } });

/** Take the open problem, think `ms`, and answer it right or wrong. */
async function solve(key: string, right: boolean, ms = 4000) {
  const { body } = await getProblem(key);
  h.clock.add(ms);
  const a = answerOf(key);
  return (await answer(key, body.problem.id, right ? a : (a + 1) % 4)).body;
}

describe("no repeat of recent expressions, whatever the random numbers (D32)", () => {
  it.each([
    [1, 36, 35],
    [2, 36, 35],
    [3, 72, 50],
  ] as const)("level %i: %i expressions, never one of the last %i", (level, total, banned) => {
    const keys = [...levelSeeds(level).keys()];
    expect(keys).toHaveLength(total);
    // History: every expression once, so all but the oldest few are banned; then each forced pick in turn.
    const recent = [...keys.slice(1), keys[0]!].slice(-50);
    const bannedKeys = recent.slice(-banned);
    const allowedCount = total - new Set(bannedKeys).size;
    for (let forced = 0; forced < total; forced++) {
      // A "random" source that always tries the same index (or the last one if fewer are offered).
      const { seed } = freshSeed(level, recent, (n) => Math.min(forced, n - 1));
      expect(bannedKeys).not.toContain(generateProblem(level, seed).key);
    }
    expect(allowedCount).toBe(total - banned);
  });
});

describe("the open problem (D32, D33)", () => {
  it("sends the expression and four choices only, never the answer", async () => {
    const { key } = await h.newGuardian();
    const { status, body } = await getProblem(key);
    expect(status).toBe(200);
    expect(Object.keys(body.problem).sort()).toEqual(["choices", "expr", "id", "type"]);
    expect(body.problem.choices).toHaveLength(4);
    const text = JSON.stringify(body);
    for (const field of ["answer", "solution", "values", "seed", "key"]) expect(text).not.toContain(`"${field}"`);
  });

  it("gives the same problem again until it is answered (reload)", async () => {
    const { key } = await h.newGuardian();
    const first = (await getProblem(key)).body.problem;
    h.clock.add(60_000);
    expect((await getProblem(key)).body.problem).toEqual(first);
    const [a, b] = await Promise.all([getProblem(key), getProblem(key)]);
    expect(a.body.problem.id).toBe(first.id);
    expect(b.body.problem.id).toBe(first.id);
  });

  it("does not repeat any of the last 50 expressions", async () => {
    // Level 3 (2~9단 × 1~9: 72 expressions) is the only level with more than 50; right answers keep it there.
    const { key } = await h.newGuardian();
    setGuardian(key, { math_step: 3 });
    const dealt: string[] = [];
    for (let i = 0; i < 70; i++) {
      await solve(key, true, 1500);
      dealt.push((h.server.db.prepare("SELECT key FROM recent_answers ORDER BY at DESC, rowid DESC").get() as any).key);
      h.clock.add(2000);
    }
    expect((h.server.db.prepare("SELECT COUNT(*) AS n FROM recent_answers").get() as any).n).toBe(50);
    dealt.forEach((k, i) => expect(dealt.slice(Math.max(0, i - 50), i)).not.toContain(k));
  });

  it("repeats a level of 36 expressions (1단계) no sooner than every 36 problems", async () => {
    const { key } = await h.newGuardian();
    const dealt: string[] = [];
    for (let i = 0; i < 150; i++) {
      await solve(key, false, 4000); // wrong answers keep the guardian at level 1
      dealt.push((h.server.db.prepare("SELECT key FROM recent_answers ORDER BY at DESC, rowid DESC").get() as any).key);
    }
    expect(guardianOf(key).math_step).toBe(1);
    const last = new Map<string, number>();
    let shortest = Infinity;
    dealt.forEach((k, i) => {
      if (last.has(k)) shortest = Math.min(shortest, i - last.get(k)!);
      last.set(k, i);
    });
    // min(50, 36 − 1) = 35 problems in between at least: the gap from one deal to the next is 36.
    expect(shortest).toBeGreaterThanOrEqual(36);
  });

  it("still deals a problem when a level has fewer than 50 expressions (1단계: 36)", async () => {
    const { key } = await h.newGuardian();
    for (let i = 0; i < 45; i++) {
      const { body } = await getProblem(key);
      expect(body.problem.id).toBeTruthy();
      await h.api("/math/skip", { method: "POST", key, body: { id: body.problem.id } });
      h.clock.add(61_000); // stay under the skip wait
    }
  });
});

describe("grading and points (D34, D48, D20)", () => {
  it("adds 10 points to the total and the wallet and upgrades the tower on its own", async () => {
    const { key } = await h.newGuardian();
    const out = await solve(key, true);
    expect(out).toMatchObject({ correct: true, points: 10, fast: false, limited: false, step: null });
    expect(out.solution.result).toBeDefined();
    // Stage 1 -> 2 costs 10: the wallet is spent at once and the rest stays.
    expect(out.me).toMatchObject({ points: "10", wallet: "0", stage: "2" });
    const second = await solve(key, true);
    expect(second.me).toMatchObject({ points: "20", wallet: "10", stage: "2" });
  });

  it("goes several stages at once and keeps the rest in the wallet", async () => {
    const { key } = await h.newGuardian();
    setGuardian(key, { wallet: 60, total_points: 60 }); // costs 10, 22, 34: 60 + 10 = 70 -> stage 4, 4 left
    const out = await solve(key, true);
    expect(out.me).toMatchObject({ stage: "4", wallet: "4", points: "70" });
  });

  it("reveals the answer only after grading; a wrong answer or a skip changes no number", async () => {
    const { key } = await h.newGuardian();
    await solve(key, true);
    const before = guardianOf(key);
    const { body } = await getProblem(key);
    h.clock.add(4000);
    const a = answerOf(key);
    const wrong = (await answer(key, body.problem.id, (a + 2) % 4)).body;
    expect(wrong).toMatchObject({ correct: false, answer: a, points: 0 });
    const skipped = (await getProblem(key)).body.problem;
    expect((await h.api("/math/skip", { method: "POST", key, body: { id: skipped.id } })).status).toBe(200);
    const after = guardianOf(key);
    for (const f of ["total_points", "wallet", "level", "stage"]) expect(after[f]).toBe(before[f]);
  });

  it("puts my bigger tower into the region from the next wave", async () => {
    const { key } = await h.newGuardian({ region: "11010" });
    const power = () => BigInt((h.server.db.prepare("SELECT next_power FROM regions WHERE code = '11010'").get() as any).next_power);
    await h.server.flushPower();
    const before = power();
    const out = await solve(key, true);
    // Pooled: the region row changes only with the next flush (every 10 s).
    expect(power()).toBe(before);
    await h.server.flushPower();
    expect(power()).toBe(before - BigInt(10) + BigInt(out.me.power));
    expect(power()).toBeGreaterThan(before);
  });

  it("a breached region changes none of my numbers (D20)", async () => {
    const { key } = await h.newGuardian({ region: "11010" });
    await h.server.flushPower();
    await solve(key, true);
    const before = guardianOf(key);
    h.clock.add(3 * DAY_MS + 7 * Number(WAVE_MS));
    // A newcomer settles the region: one small tower keeps getting breached around its top wave.
    await h.newGuardian({ region: "11010" }, "10.0.0.2");
    await h.server.flushPower();
    const region = h.server.db.prepare("SELECT * FROM regions WHERE code = '11010'").get() as any;
    expect(region.breaches).toBeGreaterThan(0);
    expect(guardianOf(key)).toEqual(before);
  });
});

describe("the server decides (D54)", () => {
  it("ignores points, level, time or correctness sent by a screen", async () => {
    const { key } = await h.newGuardian();
    const { body } = await getProblem(key);
    h.clock.add(4000);
    const wrong = (answerOf(key) + 1) % 4;
    const out = await answer(key, body.problem.id, wrong, { points: 9999, stage: 99, power: "1", wave: 500, correct: true, ms: 9000, level: 3 });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ correct: false, points: 0 });
    expect(out.body.me).toMatchObject({ points: "0", stage: "1" });
  });

  it("refuses a second answer, an unknown problem and another guardian's problem", async () => {
    const mine = await h.newGuardian();
    const other = await h.newGuardian();
    const { body } = await getProblem(mine.key);
    h.clock.add(4000);
    const a = answerOf(mine.key);
    expect((await answer(other.key, body.problem.id, a)).status).toBe(409);
    expect((await answer(mine.key, "no-such-problem", a)).status).toBe(409);
    expect((await answer(mine.key, body.problem.id, a)).status).toBe(200);
    const again = await answer(mine.key, body.problem.id, a);
    expect(again).toEqual({ status: 409, body: { error: "no_problem" } });
    expect(guardianOf(mine.key).total_points).toBe(10);
    expect((await h.api("/math/skip", { method: "POST", key: mine.key, body: { id: body.problem.id } })).status).toBe(409);
  });

  it("counts two answers sent at the same moment once", async () => {
    const { key } = await h.newGuardian();
    const { body } = await getProblem(key);
    h.clock.add(4000);
    const a = answerOf(key);
    const outs = await Promise.all([answer(key, body.problem.id, a), answer(key, body.problem.id, a), answer(key, body.problem.id, (a + 1) % 4)]);
    expect(outs.map((o) => o.status).sort()).toEqual([200, 409, 409]);
    expect(guardianOf(key).total_points).toBe(10);
    expect((h.server.db.prepare("SELECT COUNT(*) AS n FROM recent_answers").get() as any).n).toBe(1);
  });

  it("refuses made-up keys and bad picks", async () => {
    const { key } = await h.newGuardian();
    expect((await getProblem("A".repeat(43))).status).toBe(401);
    const { body } = await getProblem(key);
    expect((await answer(key, body.problem.id, 4)).status).toBe(400);
    expect((await answer(key, body.problem.id, 1.5)).status).toBe(400);
    expect((await answer("A".repeat(43), body.problem.id, 0)).status).toBe(401);
  });

  it("drops my problems and answers with my record (D8)", async () => {
    const { key } = await h.newGuardian();
    await solve(key, true);
    await getProblem(key);
    expect((await h.api("/me", { method: "DELETE", key })).status).toBe(204);
    for (const table of ["open_problems", "recent_answers"]) {
      expect((h.server.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as any).n).toBe(0);
    }
  });
});

describe("too fast, per minute and guessing (D37, D38, D39)", () => {
  it("grades a 0.99 s answer with no points and no streak; 1.00 s earns points", async () => {
    const { key } = await h.newGuardian();
    const fast = await solve(key, true, 990);
    expect(fast).toMatchObject({ correct: true, fast: true, points: 0 });
    expect(guardianOf(key).right_streak).toBe(0);
    const ok = await solve(key, true, 1000);
    expect(ok).toMatchObject({ fast: false, points: 10 });
    expect(guardianOf(key).right_streak).toBe(1);
  });

  it("gives nothing for the 21st answer inside 60 s and again once the window moves", async () => {
    const { key } = await h.newGuardian();
    // 20 answers 2 s apart (each counted 1 s after it was sent) fill 0..38 s.
    for (let i = 0; i < 20; i++) {
      const out = await solve(key, i % 2 === 0, 1000);
      h.clock.add(1000);
      if (out.correct) expect(out.points).toBeGreaterThan(0);
    }
    const twentyFirst = await solve(key, true, 1000);
    expect(twentyFirst).toMatchObject({ correct: true, limited: true, points: 0 });
    h.clock.add(60_000);
    expect(await solve(key, true, 1000)).toMatchObject({ limited: false });
  });

  it("pauses points for 5 minutes after quick guessing, then pays again", async () => {
    const { key } = await h.newGuardian();
    let out: any;
    for (let i = 0; i < 20; i++) {
      out = await solve(key, i < 6, 2000); // 30% right, 2 s each
      h.clock.add(1500); // stay under 20 answers a minute
    }
    expect(out.pauseLeftMs).toBeGreaterThan(4 * 60_000);
    const during = await solve(key, true, 3000);
    expect(during).toMatchObject({ correct: true, points: 0 });
    expect((await getProblem(key)).body.pauseLeftMs).toBeGreaterThan(0);
    h.clock.add(5 * 60_000);
    const after = await solve(key, true, 3000);
    expect(after).toMatchObject({ points: expect.any(Number), pauseLeftMs: 0 });
    expect(after.points).toBeGreaterThan(0);
  });

  it("never pauses a slow child who gets many wrong (30% right, 10 s each)", async () => {
    const { key } = await h.newGuardian();
    let out: any;
    for (let i = 0; i < 20; i++) out = await solve(key, i < 6, 10_000);
    expect(out.pauseLeftMs).toBe(0);
    expect((await solve(key, true, 10_000)).points).toBeGreaterThan(0);
  });
});

describe("skips (D40)", () => {
  const skip = async (key: string) => {
    const { body } = await getProblem(key);
    h.clock.add(2000);
    return (await h.api("/math/skip", { method: "POST", key, body: { id: body.problem.id } })).body;
  };

  it("makes the next problem wait 10 s from the 11th skip in 10 minutes", async () => {
    const { key } = await h.newGuardian();
    for (let i = 0; i < 10; i++) expect(await skip(key)).toEqual({ waitMs: 0 });
    expect(await skip(key)).toEqual({ waitMs: 10_000 });
    h.clock.add(9_999);
    expect((await getProblem(key)).body).toMatchObject({ problem: null, waitMs: 1 });
    h.clock.add(1);
    expect((await getProblem(key)).body.problem).toBeTruthy();
  });

  it("leaves the streak alone", async () => {
    const { key } = await h.newGuardian();
    for (let i = 0; i < 4; i++) await solve(key, true);
    await skip(key);
    expect(guardianOf(key).right_streak).toBe(4);
    expect(await solve(key, true)).toMatchObject({ step: "up" });
  });
});

describe("level moves through the server (D35)", () => {
  it("goes up after 5 right and pays the next level's points; down after 3 wrong", async () => {
    const { key } = await h.newGuardian();
    for (let i = 0; i < 4; i++) expect((await solve(key, true)).step).toBeNull();
    expect(await solve(key, true)).toMatchObject({ step: "up", points: 10 });
    expect(await solve(key, true)).toMatchObject({ points: 12 });
    setGuardian(key, { math_step: 3, right_streak: 0 });
    await h.api("/math/skip", { method: "POST", key, body: { id: (await getProblem(key)).body.problem.id } });
    expect(await solve(key, true)).toMatchObject({ points: 15 });
    expect((await solve(key, false)).step).toBeNull();
    expect((await solve(key, false)).step).toBeNull();
    expect(await solve(key, false)).toMatchObject({ step: "down" });
    expect(guardianOf(key).math_step).toBe(2);
  });

  it("does not count a too-fast answer toward the streak", async () => {
    const { key } = await h.newGuardian();
    for (let i = 0; i < 4; i++) await solve(key, true);
    expect(await solve(key, true, 500)).toMatchObject({ step: null, fast: true });
    expect(await solve(key, true)).toMatchObject({ step: "up" });
  });
});

describe("daily cut-down, Korean day (D36)", () => {
  /** A guardian with `count` point-earning answers already today. */
  async function withToday(count: number) {
    const { key } = await h.newGuardian();
    setGuardian(key, { today_on: kstDate(h.clock.now()), today_correct: count });
    return key;
  }

  it("pays 100% up to the 150th, 50% from the 151st with one rest notice", async () => {
    const key = await withToday(149);
    expect(await solve(key, true)).toMatchObject({ points: 10, restHint: false });
    expect(await solve(key, true)).toMatchObject({ points: 5, restHint: true, dailyRate: 50 });
    expect(await solve(key, true)).toMatchObject({ points: 5, restHint: false });
  });

  it("pays 50% up to the 300th and 10% (rounded down) from the 301st", async () => {
    const key = await withToday(299);
    expect(await solve(key, true)).toMatchObject({ points: 5 });
    expect(await solve(key, true)).toMatchObject({ points: 1, dailyRate: 10 });
  });

  it("starts again at 00:00 KST", async () => {
    h.clock.set(kstMidnight("2026-10-28") - 5000);
    const key = await withToday(200);
    const { body } = await getProblem(key);
    expect(body.dailyRate).toBe(50);
    h.clock.add(5000);
    const a = answerOf(key);
    const out = (await answer(key, body.problem.id, a)).body;
    expect(out).toMatchObject({ points: 10, dailyRate: 100 });
    expect(guardianOf(key)).toMatchObject({ today_on: "2026-10-28", today_correct: 1 });
  });

  it("does not count answers that earn nothing", async () => {
    const key = await withToday(10);
    await solve(key, true, 500);
    await solve(key, false);
    expect(guardianOf(key).today_correct).toBe(10);
  });
});
