import { describe, expect, it } from "vitest";
import { panelHeader } from "./math-panel";
import { answerNote, canAnswer, loadingView, markedView, problemView, wrongTip, type AnswerReply, type ProblemReply } from "./server-math";

const NOW = 1_000_000;
const problem: ProblemReply = {
  problem: { id: "p1", type: "곱셈구구", expr: ["7 × 8 = ", { blank: true }], choices: [["56"], ["63"], ["48"], ["15"]] },
  waitMs: 0,
  pauseLeftMs: 0,
  dailyRate: 100,
};
const reply = (fields: Partial<AnswerReply>): AnswerReply => ({
  correct: true,
  answer: 0,
  solution: { text: ["7 × 8 = "], result: ["56"] },
  points: 10,
  fast: false,
  limited: false,
  restHint: false,
  step: null,
  me: {} as AnswerReply["me"],
  pauseLeftMs: 0,
  dailyRate: 100,
  ...fields,
});

describe("server problems on the panel (T12)", () => {
  it("shows a problem with its header and no marking until the server marks it", () => {
    const v = problemView(loadingView(), problem, NOW);
    expect(v).toMatchObject({ id: "p1", answered: null, daily: false });
    expect(canAnswer(v, NOW)).toBe(true);
    expect(panelHeader(v, NOW).text).toBe("곱셈구구");
  });

  it("locks the loading panel", () => {
    expect(canAnswer(loadingView(), NOW)).toBe(false);
  });

  it("takes the right choice and the solution from the marking", () => {
    const v = markedView(problemView(loadingView(), problem, NOW), reply({ correct: false, answer: 2, points: 0 }), 1, NOW);
    expect(v.answered).toMatchObject({ pick: 1, correct: false, answer: 2, solution: { result: ["56"] } });
    expect(canAnswer(v, NOW)).toBe(false);
  });

  it("explains why a right answer earned nothing (D37, D38, D39)", () => {
    expect(answerNote(reply({ fast: true, points: 0 }))).toBe("천천히 풀어도 괜찮아요");
    expect(answerNote(reply({ limited: true, points: 0 }))).toBe("잠깐 쉬었다 해요");
    expect(answerNote(reply({ points: 0, pauseLeftMs: 200_000 }))).toBe("포인트 멈춤 중");
    expect(answerNote(reply({}))).toBeNull();
  });

  it("counts the guess pause down in the header from the server's time left", () => {
    const v = markedView(problemView(loadingView(), problem, NOW), reply({ points: 0, pauseLeftMs: 300_000 }), 0, NOW);
    expect(panelHeader(v, NOW).text).toBe("포인트 멈춤 5:00 · 문제를 천천히 읽어 봐요");
    expect(panelHeader(v, NOW + 299_500).tone).toBe("warn");
    expect(panelHeader(v, NOW + 300_000).text).toBe("곱셈구구");
  });

  it("shows the skip wait and keeps the last problem locked (D40)", () => {
    const skipped = { ...problemView(loadingView(), problem, NOW), id: undefined };
    const v = problemView(skipped, { problem: null, waitMs: 10_000, pauseLeftMs: 0, dailyRate: 100 }, NOW);
    expect(panelHeader(v, NOW).text).toBe("잠깐 쉬었다 해요 · 10초 뒤에 다음 문제");
    expect(canAnswer(v, NOW)).toBe(false);
  });

  it("says when today's points are cut down (D36)", () => {
    expect(panelHeader(problemView(loadingView(), { ...problem, dailyRate: 50 }, NOW), NOW).text).toContain("포인트 절반");
    expect(panelHeader(problemView(loadingView(), { ...problem, dailyRate: 10 }, NOW), NOW).text).toContain("10분의 1");
  });

  it("never scolds after a wrong answer", () => {
    expect(wrongTip(reply({ correct: false }))).toBe("괜찮아요, 다음 문제에서 또 해 봐요");
    expect(wrongTip(reply({ correct: false, step: "down" }))).toBe("조금 쉬운 문제로 연습해요");
    expect(wrongTip(reply({ correct: false, fast: true }))).toBe("천천히 풀어도 괜찮아요");
  });
});
