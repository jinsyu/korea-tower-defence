// Problem panel state on the screen (fake until the server deals and marks problems, T12).
// Rules shown here follow spec "문제 흐름과 포인트", "난이도 이동" and "찍기·매크로·반복 막기".
import { generateProblem, type MathLevel } from "@ktd/core";
import { GRADE_BANDS, type GradeBandId } from "@/lib/grade-bands";
import { fakeProblemsFor, type FakeProblem } from "./fake-problems";

/** Points per correct answer by level (spec: 10, 12, 15). */
export const LEVEL_POINTS = [10, 12, 15] as const;
/** An answer within this time after the problem appeared earns no points and does not count toward streaks. */
export const TOO_FAST_MS = 1000;
/** Correct answer: the next problem comes after this. */
export const NEXT_AFTER_MS = 900;
export const NEXT_AFTER_LEVEL_UP_MS = 1700;
export const REDUCED_NEXT_AFTER_MS = 600;

export type Answered = {
  pick: number;
  correct: boolean;
  points: number;
  /** Shown next to the points ("천천히 풀어도 괜찮아요"). */
  note: string | null;
};

export type PanelState = {
  band: GradeBandId;
  level: 1 | 2 | 3;
  streak: number;
  wrongStreak: number;
  /** Problems dealt so far; the seed of the next generated problem (or the next fake 5~6학년 problem). */
  dealt: number;
  /** The open problem. A level change applies from the next one. */
  problem: FakeProblem;
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

function deal(band: GradeBandId, level: number, dealt: number): FakeProblem {
  if (band !== "56") return generateProblem(band, level as MathLevel, dealt);
  const list = fakeProblemsFor(band, level);
  return list[dealt % list.length]!;
}

export function newPanel(band: GradeBandId, now: number, level: 1 | 2 | 3 = 1): PanelState {
  return {
    band,
    level,
    streak: 0,
    wrongStreak: 0,
    dealt: 0,
    problem: deal(band, level, 0),
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
  return { ...s, dealt: s.dealt + 1, problem: deal(s.band, s.level, s.dealt + 1), shownAt: now, answered: null, advanceAt: null };
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
  const answered: Answered = { pick, correct, points, note };
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
 * Header line: "학년군 · 유형" (D42). Guess pause and the daily notice borrow the same line so the panel never grows.
 * The level is never shown.
 */
export function panelHeader(s: PanelState, now: number): Header {
  const left = s.pausedUntil - now;
  if (left > 0) {
    const sec = Math.ceil(left / 1000);
    return { text: `포인트 멈춤 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} · 문제를 천천히 읽어 봐요`, tone: "warn" };
  }
  if (s.daily) return { text: "쉬어 가도 괜찮아요 · 지금은 포인트 절반", tone: "info" };
  return { text: `${bandLabel(s.band)} · ${s.problem.type}`, tone: "plain" };
}

export const bandLabel = (band: GradeBandId): string => GRADE_BANDS.find((b) => b.id === band)!.label;
