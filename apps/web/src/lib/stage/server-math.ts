// Problems from the game server (T12): the server deals, marks and pays; the screen only shows its replies.
// A problem arrives without its answer; the answer and solution arrive with the marking (D33).
import type { MathText } from "@ktd/core";
import type { ServerMe } from "@/lib/game-server";
import type { GradeBandId } from "@/lib/grade-bands";
import type { Answered, PanelView } from "./math-panel";

export type ServerProblem = { id: string; band: GradeBandId; type: string; expr: MathText; choices: MathText[] };

type MathStatus = { pauseLeftMs: number; dailyRate: number };

export type ProblemReply = { problem: ServerProblem | null; waitMs: number } & MathStatus;

export type AnswerReply = {
  correct: boolean;
  answer: number;
  solution: { text: MathText; result: MathText };
  points: number;
  fast: boolean;
  limited: boolean;
  restHint: boolean;
  step: "up" | "down" | null;
  me: ServerMe;
} & MathStatus;

/** Shown while the first problem loads: the panel keeps its size and its choices stay locked. */
const LOADING: PanelView["problem"] = { type: "문제를 불러오는 중", expr: ["…"], choices: [[""], [""], [""], [""]] };

const status = (r: MathStatus, now: number) => ({
  pausedUntil: r.pauseLeftMs > 0 ? now + r.pauseLeftMs : 0,
  daily: r.dailyRate < 100,
  dailyRate: r.dailyRate,
});

export const loadingView = (band: GradeBandId): PanelView => ({ band, problem: LOADING, answered: null, pausedUntil: 0, daily: false });

/**
 * The panel for a problem reply. While the server makes me wait after many skips, the last problem stays on screen
 * (locked) with the wait in the header.
 */
export function problemView(prev: PanelView, r: ProblemReply, now: number): PanelView {
  if (!r.problem) return { ...prev, ...status(r, now), waitUntil: now + r.waitMs };
  const { id, band, type, expr, choices } = r.problem;
  return { band, id, problem: { type, expr, choices: choices as PanelView["problem"]["choices"] }, answered: null, waitUntil: 0, ...status(r, now) };
}

/** The note next to the points: why a right answer earned nothing. */
export function answerNote(r: AnswerReply): string | null {
  if (r.fast) return "천천히 풀어도 괜찮아요";
  if (r.limited) return "잠깐 쉬었다 해요";
  if (r.correct && r.points === 0 && r.pauseLeftMs > 0) return "포인트 멈춤 중";
  return null;
}

/** My marked answer on the panel. */
export function markedView(prev: PanelView, r: AnswerReply, pick: number, now: number): PanelView {
  const answered: Answered = { pick, correct: r.correct, points: r.points, note: answerNote(r), answer: r.answer, solution: r.solution };
  return { ...prev, answered, ...status(r, now) };
}

/** The tip under the board after a wrong answer. Never scolding. */
export function wrongTip(r: AnswerReply): string {
  if (r.step === "down") return "조금 쉬운 문제로 연습해요";
  return answerNote(r) ?? "괜찮아요, 다음 문제에서 또 해 봐요";
}

/** Whether the choices can be pressed. */
export const canAnswer = (v: PanelView, now: number): boolean => v.id !== undefined && v.answered === null && (v.waitUntil ?? 0) <= now;
