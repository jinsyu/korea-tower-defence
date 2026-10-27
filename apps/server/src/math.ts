// Problems and grading on the server (spec "문제 흐름과 포인트", "찍기·매크로·반복 막기", "자동 성장").
// One open problem per guardian; the screen gets the expression and four choices only, the answer after grading.
// Every function runs synchronously inside one batched-write transaction, so two answers to the same problem are
// handled one after the other and only the first finds it open (D32, D54).
import {
  addPoints,
  answerPoints,
  dailyRatePercent,
  FULL_POINTS_UNTIL,
  generateProblem,
  type MathLevel,
  type MathText,
} from "@ktd/core";
import { randomBytes, randomInt } from "node:crypto";
import type { Db } from "./db";
import { kstDate } from "./dates";
import { meView, powerOf, type GuardianRow, type MeView } from "./guardians";
import {
  countedToday,
  GUESS_PAUSE_MS,
  isTooFast,
  looksLikeGuessing,
  moveStep,
  nextProblemAt,
  overMinuteLimit,
  RECENT_KEPT,
  type Outcome,
  type Recent,
} from "./math-rules";
import type { Points24 } from "./points24";
import type { Regions } from "./regions";

/** Seeds scanned per level to list its expressions (36 or 72); every expression gets dozens of seeds. */
const SEED_SCAN = 5_000;
const seedsByLevel = new Map<MathLevel, Map<string, number[]>>();

/** Every expression of a level with the seeds that deal it. */
export function levelSeeds(level: MathLevel): Map<string, number[]> {
  let seeds = seedsByLevel.get(level);
  if (!seeds) {
    seeds = new Map();
    for (let seed = 0; seed < SEED_SCAN; seed++) {
      const key = generateProblem(level, seed).key;
      seeds.set(key, [...(seeds.get(key) ?? []), seed]);
    }
    seedsByLevel.set(level, seeds);
  }
  return seeds;
}

/**
 * A seed of an expression outside the last min(50, n − 1) recent ones of a level of n expressions (spec 결정 사항):
 * the allowed expressions are fixed first and `pick` (an index below its argument) only chooses among them.
 */
export function freshSeed(level: MathLevel, recentKeys: readonly string[], pick: (n: number) => number = (n) => randomInt(n)) {
  const seeds = levelSeeds(level);
  const banned = new Set(recentKeys.slice(-Math.min(RECENT_KEPT, seeds.size - 1)));
  const allowed = [...seeds.keys()].filter((k) => !banned.has(k));
  const ofKey = seeds.get(allowed[pick(allowed.length)]!)!;
  const seed = ofKey[pick(ofKey.length)]!;
  return { seed, answer: generateProblem(level, seed).answer };
}

type OpenRow = { guardian_id: string; id: string; seed: number; level: MathLevel; answer: number; sent_at: number };
type RecentRow = Recent & { key: string };

type MathRow = GuardianRow & {
  math_step: MathLevel;
  right_streak: number;
  wrong_streak: number;
  today_on: string | null;
  today_correct: number;
  points_paused_until: number;
};

/** What the screen sees of a problem: no answer, no values, no solution, no seed (D33). */
export type ShownProblem = { id: string; type: string; expr: MathText; choices: MathText[] };

/** Header state the screen needs after a reload too. */
export type MathStatus = { pauseLeftMs: number; dailyRate: number };

export type ProblemReply = ({ problem: ShownProblem; waitMs: 0 } | { problem: null; waitMs: number }) & MathStatus;

export type AnswerReply = {
  correct: boolean;
  /** Revealed only now, with the solution. */
  answer: number;
  solution: { text: MathText; result: MathText };
  points: number;
  fast: boolean;
  limited: boolean;
  /** 151st point-earning answer today: "쉬어 가도 괜찮아요", once a day. */
  restHint: boolean;
  step: "up" | "down" | null;
  me: MeView;
} & MathStatus;

export type Refused = { error: "no_problem" | "no_guardian" };

export type MathService = ReturnType<typeof createMath>;

/** `onCorrect` counts right answers per region for the region broadcast ("지난 1초 정답 수"). */
export function createMath(db: Db, regions: Regions, points24: Points24, onCorrect: (region: string) => void) {
  const q = {
    guardian: db.prepare<[string], MathRow>("SELECT * FROM guardians WHERE id = ?"),
    open: db.prepare<[string], OpenRow>("SELECT * FROM open_problems WHERE guardian_id = ?"),
    insertOpen: db.prepare(
      "INSERT INTO open_problems (guardian_id, id, seed, level, answer, sent_at) VALUES (@guardian_id, @id, @seed, @level, @answer, @sent_at)",
    ),
    closeOpen: db.prepare("DELETE FROM open_problems WHERE guardian_id = ?"),
    recent: db.prepare<[string], RecentRow>("SELECT key, outcome, ms, at FROM recent_answers WHERE guardian_id = ? ORDER BY at, rowid"),
    insertRecent: db.prepare("INSERT INTO recent_answers (guardian_id, key, outcome, ms, at) VALUES (?, ?, ?, ?, ?)"),
    trimRecent: db.prepare(
      `DELETE FROM recent_answers WHERE guardian_id = @g AND rowid NOT IN
         (SELECT rowid FROM recent_answers WHERE guardian_id = @g ORDER BY at DESC, rowid DESC LIMIT ${RECENT_KEPT})`,
    ),
    saveAnswer: db.prepare(
      `UPDATE guardians SET math_step = @math_step, right_streak = @right_streak, wrong_streak = @wrong_streak,
         today_on = @today_on, today_correct = @today_correct, points_paused_until = @points_paused_until,
         total_points = @total_points, wallet = @wallet, level = @level, stage = @stage WHERE id = @id`,
    ),
  };

  const status = (g: MathRow, now: number): MathStatus => ({
    pauseLeftMs: Math.max(0, g.points_paused_until - now),
    dailyRate: Number(dailyRatePercent(BigInt(countedToday(g.today_on, g.today_correct, now) + 1))),
  });

  const show = (row: OpenRow): ShownProblem => {
    const p = generateProblem(row.level, row.seed);
    return { id: row.id, type: p.type, expr: p.expr, choices: p.choices };
  };

  function remember(guardianId: string, key: string, outcome: Outcome, ms: number, at: number) {
    q.insertRecent.run(guardianId, key, outcome, ms, at);
    q.trimRecent.run({ g: guardianId });
  }

  /** The open problem, made now when there is none. Reloading gets the same one (D32). */
  function problem(guardianId: string, now: number): ProblemReply | Refused {
    const g = q.guardian.get(guardianId);
    if (!g) return { error: "no_guardian" };
    const open = q.open.get(guardianId);
    if (open) return { problem: show(open), waitMs: 0, ...status(g, now) };
    const recent = q.recent.all(guardianId);
    const waitMs = nextProblemAt(recent) - now;
    if (waitMs > 0) return { problem: null, waitMs, ...status(g, now) };
    const { seed, answer } = freshSeed(g.math_step, recent.map((r) => r.key));
    const row: OpenRow = { guardian_id: guardianId, id: randomBytes(12).toString("base64url"), seed, level: g.math_step, answer, sent_at: now };
    q.insertOpen.run(row);
    return { problem: show(row), waitMs: 0, ...status(g, now) };
  }

  const openFor = (guardianId: string, problemId: string): OpenRow | undefined => {
    const open = q.open.get(guardianId);
    return open && open.id === problemId ? open : undefined;
  };

  /** Grade an answer. Only the open problem of this guardian, once; everything else comes from the server's own rows (D54). */
  function answer(guardianId: string, problemId: string, pick: number, at: number): AnswerReply | Refused {
    const g = q.guardian.get(guardianId);
    if (!g) return { error: "no_guardian" };
    const open = openFor(guardianId, problemId);
    if (!open) return { error: "no_problem" };
    q.closeOpen.run(guardianId);

    const p = generateProblem(open.level, open.seed);
    const correct = pick === open.answer;
    const ms = at - open.sent_at;
    const fast = isTooFast(open.sent_at, at);
    const earlier = q.recent.all(guardianId);
    const limited = overMinuteLimit(earlier, at);
    remember(guardianId, p.key, correct ? "right" : "wrong", ms, at);

    // Guess suspicion looks at answers since the last pause ended, this one included (D39).
    let pausedUntil = g.points_paused_until;
    if (at >= pausedUntil) {
      const since = q.recent.all(guardianId).filter((r) => r.outcome !== "skip" && r.at >= pausedUntil);
      if (looksLikeGuessing(since)) pausedUntil = at + GUESS_PAUSE_MS;
    }
    const paused = at < pausedUntil;

    // Skips and too-fast answers leave the streaks alone (D35, D37).
    const streaks = fast
      ? { step: g.math_step, right: g.right_streak, wrong: g.wrong_streak, moved: null }
      : moveStep({ step: g.math_step, right: g.right_streak, wrong: g.wrong_streak }, correct);

    const today = countedToday(g.today_on, g.today_correct, at);
    const earns = correct && !fast && !limited && !paused;
    const nth = earns ? today + 1 : today;
    const points = earns ? answerPoints(open.level, BigInt(nth)) : BigInt(0);

    const before = { total: BigInt(g.total_points), wallet: BigInt(g.wallet), level: BigInt(g.level), stage: BigInt(g.stage) };
    const after = addPoints(before, points);
    q.saveAnswer.run({
      id: guardianId,
      math_step: streaks.step,
      right_streak: streaks.right,
      wrong_streak: streaks.wrong,
      today_on: kstDate(at),
      today_correct: nth,
      points_paused_until: pausedUntil,
      total_points: Number(after.total),
      wallet: Number(after.wallet),
      level: Number(after.level),
      stage: Number(after.stage),
    });
    points24.add(guardianId, at, Number(points));
    const saved = q.guardian.get(guardianId)!;
    // My tower's power joins the region with the next pool flush, from the wave after (spec "화면 연출과 서버 결과 맞추기").
    const delta = powerOf(saved) - powerOf(g);
    if (delta !== BigInt(0)) regions.shiftPower(g.region, delta, 0);
    if (correct) onCorrect(g.region);

    return {
      correct,
      answer: open.answer,
      solution: p.solution,
      points: Number(points),
      fast,
      limited,
      restHint: earns && nth === Number(FULL_POINTS_UNTIL) + 1,
      step: streaks.moved,
      me: meView(saved, at, points24.of(guardianId, at)),
      ...status(saved, at),
    };
  }

  /** Skip: no points, streaks unchanged; many skips make the next problem wait (D40). */
  function skip(guardianId: string, problemId: string, at: number): { waitMs: number } | Refused {
    const open = openFor(guardianId, problemId);
    if (!open) return { error: "no_problem" };
    q.closeOpen.run(guardianId);
    remember(guardianId, generateProblem(open.level, open.seed).key, "skip", at - open.sent_at, at);
    return { waitMs: Math.max(0, nextProblemAt(q.recent.all(guardianId)) - at) };
  }

  return { problem, answer, skip };
}
