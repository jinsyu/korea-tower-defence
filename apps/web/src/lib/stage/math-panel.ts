// Problem panel state on the screen. With a guardian the server deals and marks the problems (T12, server-math.ts);
// the dev-only `?demo=` screens still deal and mark here with the same rules (spec "문제 흐름과 포인트", "난이도 이동",
// "찍기·매크로·반복 막기").
import { generateProblem, type Problem } from "@ktd/core";

/** Points per correct answer by level (spec: 10, 12, 15). */
export const LEVEL_POINTS = [10, 12, 15] as const;
/** An answer within this time after the problem appeared earns no points and does not count toward streaks. */
export const TOO_FAST_MS = 1000;
/** Correct answer: the next problem comes after this (spec 0.8 s, D32). */
export const NEXT_AFTER_MS = 800;
export const NEXT_AFTER_LEVEL_UP_MS = 1700;
export const REDUCED_NEXT_AFTER_MS = 600;

export type Answered = {
  pick: number;
  correct: boolean;
  points: number;
  /** Shown next to the points ("천천히 풀어도 괜찮아요"). */
  note: string | null;
  /** The right choice and the solution arrive only with the marking (D33). */
  answer: number;
  solution: Problem["solution"];
};

/** What the panel shows of a problem before it is answered: no answer, no solution. */
export type ShownProblem = Pick<Problem, "type" | "expr" | "choices">;

/** Everything the problem panel and its header draw. */
export type PanelView = {
  problem: ShownProblem;
  answered: Answered | null;
  /** Guess suspicion: points paused until this time (Date.now()). */
  pausedUntil: number;
  /** Many correct answers today: points cut down, header says so. */
  daily: boolean;
  /** Percent paid now when `daily` (50 or 10); 50 when not given. */
  dailyRate?: number;
  /** Many skips: the next problem comes at this time (Date.now()). */
  waitUntil?: number;
  /** Server problem id, kept on the panel for tests and screen checks. */
  id?: string;
};

export type PanelState = {
  level: 1 | 2 | 3;
  streak: number;
  wrongStreak: number;
  /** Problems dealt so far; the seed of the next generated problem. */
  dealt: number;
  /** The open problem. A level change applies from the next one. */
  problem: Problem;
  /** Date.now() when the current problem appeared. */
  shownAt: number;
  answered: Answered | null;
  /** Guess suspicion: points paused until this time (Date.now()). */
  pausedUntil: number;
  /** Many correct answers today: points halved, header says so. */
  daily: boolean;
  /** After a correct answer: when the next problem comes (Date.now()). Held while the connection is lost. */
  advanceAt: number | null;
};

export type AnswerOutcome = {
  state: PanelState;
  answered: Answered;
  /** Five correct in a row: harder problems from now on. */
  levelUp: boolean;
  /** Three wrong in a row: easier problems from now on. */
  levelDown: boolean;
};

const deal = (level: 1 | 2 | 3, dealt: number): Problem => generateProblem(level, dealt);

export function newPanel(now: number, level: 1 | 2 | 3 = 1): PanelState {
  return {
    level,
    streak: 0,
    wrongStreak: 0,
    dealt: 0,
    problem: deal(level, 0),
    shownAt: now,
    answered: null,
    pausedUntil: 0,
    daily: false,
    advanceAt: null,
  };
}

/** The problem is on screen and can be pressed from `now`; until then any answer counts as too fast. */
export function markShown(s: PanelState, now: number): PanelState {
  return { ...s, shownAt: now };
}

/** Skip, or "다음 문제" after a wrong answer: no points, streaks unchanged. */
export function nextProblem(s: PanelState, now: number): PanelState {
  return { ...s, dealt: s.dealt + 1, problem: deal(s.level, s.dealt + 1), shownAt: now, answered: null, advanceAt: null };
}

/** Milliseconds until the automatic next problem, or null: none pending, or held while offline (D58). */
export function advanceDelay(s: PanelState, offline: boolean, now: number): number | null {
  if (offline || s.advanceAt === null) return null;
  return Math.max(0, s.advanceAt - now);
}

/** Back online: the answered problem stays for a full pause again before the next one comes. */
export function resumeAfterReconnect(s: PanelState, now: number): PanelState {
  return s.advanceAt === null ? s : { ...s, advanceAt: now + NEXT_AFTER_MS };
}

export function answerProblem(s: PanelState, pick: number, now: number, reduced = false): AnswerOutcome {
  const p = s.problem;
  const correct = pick === p.answer;
  // shownAt 0: not marked shown yet, so the answer cannot be a considered one.
  const fast = s.shownAt <= 0 || now - s.shownAt < TOO_FAST_MS;
  let points = 0;
  let note: string | null = null;
  if (correct) {
    if (fast) note = "천천히 풀어도 괜찮아요";
    else if (s.pausedUntil > now) note = "포인트 멈춤 중";
    else points = s.daily ? Math.round(LEVEL_POINTS[s.level - 1]! / 2) : LEVEL_POINTS[s.level - 1]!;
  }
  const answered: Answered = { pick, correct, points, note, answer: p.answer, solution: p.solution };
  let { level, streak, wrongStreak } = s;
  let levelUp = false;
  let levelDown = false;
  if (!fast) {
    if (correct) {
      streak++;
      wrongStreak = 0;
      if (streak >= 5 && level < 3) {
        level = (level + 1) as 1 | 2 | 3;
        streak = 0;
        levelUp = true;
      }
    } else {
      streak = 0;
      wrongStreak++;
      if (wrongStreak >= 3 && level > 1) {
        level = (level - 1) as 1 | 2 | 3;
        wrongStreak = 0;
        levelDown = true;
      }
    }
  }
  const advanceAt = correct ? now + (reduced ? REDUCED_NEXT_AFTER_MS : levelUp ? NEXT_AFTER_LEVEL_UP_MS : NEXT_AFTER_MS) : null;
  return { state: { ...s, level, streak, wrongStreak, answered, advanceAt }, answered, levelUp, levelDown };
}

export type Header = { text: string; tone: "plain" | "warn" | "info" };

/**
 * Header line: the type name, "곱셈구구" (D42). Guess pause and the daily notice borrow the same line so the panel never grows.
 * The level is never shown.
 */
export function panelHeader(s: PanelView, now: number): Header {
  const left = s.pausedUntil - now;
  if (left > 0) {
    const sec = Math.ceil(left / 1000);
    return { text: `포인트 멈춤 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} · 문제를 천천히 읽어 봐요`, tone: "warn" };
  }
  const wait = (s.waitUntil ?? 0) - now;
  if (wait > 0) return { text: `잠깐 쉬었다 해요 · ${Math.ceil(wait / 1000)}초 뒤에 다음 문제`, tone: "info" };
  if (s.daily) return { text: `쉬어 가도 괜찮아요 · 지금은 포인트 ${s.dailyRate === 10 ? "10분의 1" : "절반"}`, tone: "info" };
  return { text: s.problem.type, tone: "plain" };
}
