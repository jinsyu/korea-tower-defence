// Anti-guessing and level rules for answers (spec "난이도 이동", "문제 흐름과 포인트", "찍기·매크로·반복 막기").
// Pure functions over the stored recent answers, so the boundaries can be tested without a server.
import type { MathLevel } from "@ktd/core";
import { kstDate } from "./dates";

/** An answer within this time after the problem was sent is graded but earns nothing and keeps the streaks (D37). */
export const TOO_FAST_MS = 1000;
/** The 21st answer inside a moving 60 seconds and after earn nothing (D38). */
export const ANSWERS_PER_MINUTE = 20;
export const MINUTE_MS = 60_000;
/** Guess suspicion (D39): the last 20 answers right under 35% with a median time under 3 s pause points 5 minutes. */
export const GUESS_WINDOW = 20;
export const GUESS_RIGHT_PERCENT = 35;
export const GUESS_MEDIAN_MS = 3000;
export const GUESS_PAUSE_MS = 5 * MINUTE_MS;
/** More than 10 skips inside 10 minutes: the next problem waits 10 seconds (D40). */
export const SKIPS_ALLOWED = 10;
export const SKIP_WINDOW_MS = 10 * MINUTE_MS;
export const SKIP_WAIT_MS = 10_000;
/** Level moves (D35). */
export const RIGHTS_TO_RISE = 5;
export const WRONGS_TO_DROP = 3;
/** Problems kept per guardian; a new problem avoids their expressions (D32). */
export const RECENT_KEPT = 50;

export type Outcome = "right" | "wrong" | "skip";
/** A stored recent problem: answered or skipped at `at` (server ms), `ms` after it was sent. */
export type Recent = { outcome: Outcome; ms: number; at: number };

export const isTooFast = (sentAt: number, at: number): boolean => at - sentAt < TOO_FAST_MS;

/** This answer's place among the answers of the last 60 seconds (`earlier` excludes this answer). */
export function answerNumberInMinute(earlier: readonly Recent[], at: number): number {
  return earlier.filter((r) => r.outcome !== "skip" && r.at > at - MINUTE_MS).length + 1;
}

export const overMinuteLimit = (earlier: readonly Recent[], at: number): boolean =>
  answerNumberInMinute(earlier, at) > ANSWERS_PER_MINUTE;

/**
 * Whether these answers look like guessing. `answers` are the guardian's answers (no skips) since the last pause
 * ended, newest last, this answer included. Fewer than 20 never pause.
 */
export function looksLikeGuessing(answers: readonly Recent[]): boolean {
  if (answers.length < GUESS_WINDOW) return false;
  const last = answers.slice(-GUESS_WINDOW);
  const right = last.filter((r) => r.outcome === "right").length;
  if (right * 100 >= GUESS_RIGHT_PERCENT * GUESS_WINDOW) return false;
  const times = last.map((r) => r.ms).sort((a, b) => a - b);
  // Median of 20 = mean of the 10th and 11th; compared doubled to stay in integers.
  return times[GUESS_WINDOW / 2 - 1]! + times[GUESS_WINDOW / 2]! < 2 * GUESS_MEDIAN_MS;
}

/** When the next problem may come after skips: 10 s after the latest skip if it was the 11th or later in 10 minutes. */
export function nextProblemAt(recent: readonly Recent[]): number {
  const skips = recent.filter((r) => r.outcome === "skip").map((r) => r.at);
  if (skips.length === 0) return 0;
  const latest = Math.max(...skips);
  const inWindow = skips.filter((at) => at > latest - SKIP_WINDOW_MS).length;
  return inWindow > SKIPS_ALLOWED ? latest + SKIP_WAIT_MS : 0;
}

export type Streaks = { step: MathLevel; right: number; wrong: number };

/** Five right in a row at one level go up, three wrong go down (D35). Callers skip this for skips and too-fast answers. */
export function moveStep(s: Streaks, correct: boolean): Streaks & { moved: "up" | "down" | null } {
  if (correct) {
    const right = s.right + 1;
    if (right >= RIGHTS_TO_RISE && s.step < 3) return { step: (s.step + 1) as MathLevel, right: 0, wrong: 0, moved: "up" };
    return { step: s.step, right, wrong: 0, moved: null };
  }
  const wrong = s.wrong + 1;
  if (wrong >= WRONGS_TO_DROP && s.step > 1) return { step: (s.step - 1) as MathLevel, right: 0, wrong: 0, moved: "down" };
  return { step: s.step, right: 0, wrong, moved: null };
}

/** Correct answers already counted today (Korean day): a new day starts from 0 (D36). */
export const countedToday = (todayOn: string | null, todayCorrect: number, at: number): number =>
  todayOn === kstDate(at) ? todayCorrect : 0;
