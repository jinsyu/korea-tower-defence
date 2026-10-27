import { describe, expect, it } from "vitest";
import { kstMidnight } from "./dates";
import {
  answerNumberInMinute,
  countedToday,
  isTooFast,
  looksLikeGuessing,
  moveStep,
  nextProblemAt,
  overMinuteLimit,
  type Outcome,
  type Recent,
} from "./math-rules";

const T = 1_000_000_000;
const answers = (n: number, at: (i: number) => number, outcome: Outcome = "right", ms = 4000): Recent[] =>
  Array.from({ length: n }, (_, i) => ({ outcome, ms, at: at(i) }));

describe("too fast answers (D37)", () => {
  it("counts 0.99 s as too fast and 1.00 s as not", () => {
    expect(isTooFast(T, T + 990)).toBe(true);
    expect(isTooFast(T, T + 999)).toBe(true);
    expect(isTooFast(T, T + 1000)).toBe(false);
  });
});

describe("answers per minute, a moving 60 s window (D38)", () => {
  // 20 answers one second apart, the first at T.
  const twenty = answers(20, (i) => T + i * 1000);

  it("lets the 20th answer through and stops the 21st", () => {
    expect(overMinuteLimit(twenty.slice(0, 19), T + 19_000)).toBe(false);
    expect(answerNumberInMinute(twenty, T + 20_000)).toBe(21);
    expect(overMinuteLimit(twenty, T + 59_999)).toBe(true);
  });

  it("frees a place as soon as the oldest answer is 60 s old", () => {
    expect(overMinuteLimit(twenty, T + 60_000)).toBe(false);
  });

  it("does not count skips", () => {
    expect(overMinuteLimit(answers(25, (i) => T + i, "skip"), T + 100)).toBe(false);
  });
});

describe("guess suspicion (D39)", () => {
  /** 20 answers with `right` of them correct, all taking `ms`. */
  const record = (right: number, ms: number): Recent[] =>
    Array.from({ length: 20 }, (_, i) => ({ outcome: i < right ? "right" : "wrong", ms, at: T + i }));

  it("pauses under 35% right with a median under 3 s", () => {
    expect(looksLikeGuessing(record(6, 1500))).toBe(true); // 30%
    expect(looksLikeGuessing(record(7, 1500))).toBe(false); // 35% is not under 35%
  });

  it("does not pause a slow child who gets many wrong (30% right, median 10 s)", () => {
    expect(looksLikeGuessing(record(6, 10_000))).toBe(false);
  });

  it("uses the median: 3.0 s exactly does not pause, just under does", () => {
    const at3s = record(2, 3000);
    expect(looksLikeGuessing(at3s)).toBe(false);
    const mixed = record(2, 0).map((r, i) => ({ ...r, ms: i < 10 ? 2999 : 3000 }));
    expect(looksLikeGuessing(mixed)).toBe(true); // (2999 + 3000) / 2 < 3000
  });

  it("needs 20 answers and looks only at the last 20", () => {
    expect(looksLikeGuessing(record(0, 500).slice(1))).toBe(false);
    const goodThenBad = [...answers(10, (i) => T + i, "wrong", 500), ...record(20, 500)];
    expect(looksLikeGuessing(goodThenBad)).toBe(false);
  });
});

describe("skip wait (D40)", () => {
  it("waits 10 s after the 11th skip inside 10 minutes, not after the 10th", () => {
    const ten = answers(10, (i) => T + i * 1000, "skip", 2000);
    expect(nextProblemAt(ten)).toBe(0);
    const eleven = [...ten, { outcome: "skip" as const, ms: 2000, at: T + 30_000 }];
    expect(nextProblemAt(eleven)).toBe(T + 40_000);
  });

  it("forgets skips older than 10 minutes", () => {
    const spread = answers(11, (i) => (i === 0 ? T : T + 600_000 + i), "skip");
    expect(nextProblemAt(spread)).toBe(0);
    // Latest skip at T + 600,000: the window is (T, T + 600,000], so a skip at T + 1 is the 11th inside it.
    const inside = answers(11, (i) => (i === 0 ? T + 1 : T + 599_990 + i), "skip");
    expect(nextProblemAt(inside)).toBe(T + 600_000 + 10_000);
  });
});

describe("level moves (D35)", () => {
  const run = (results: boolean[], start = { step: 1 as const, right: 0, wrong: 0 }) =>
    results.reduce<ReturnType<typeof moveStep>>((s, c) => moveStep(s, c), { ...start, moved: null });

  it("goes up after 5 right in a row, not 4", () => {
    expect(run([true, true, true, true])).toMatchObject({ step: 1, right: 4 });
    expect(run([true, true, true, true, true])).toMatchObject({ step: 2, right: 0, moved: "up" });
  });

  it("stays at level 3", () => {
    expect(moveStep({ step: 3, right: 4, wrong: 0 }, true)).toMatchObject({ step: 3, right: 5, moved: null });
  });

  it("goes down after 3 wrong in a row, not 2, and not below level 1", () => {
    expect(moveStep({ step: 2, right: 0, wrong: 1 }, false)).toMatchObject({ step: 2, wrong: 2, moved: null });
    expect(moveStep({ step: 2, right: 0, wrong: 2 }, false)).toMatchObject({ step: 1, wrong: 0, moved: "down" });
    expect(moveStep({ step: 1, right: 0, wrong: 2 }, false)).toMatchObject({ step: 1, wrong: 3, moved: null });
  });

  it("a wrong answer breaks the right streak and the other way round", () => {
    expect(run([true, true, true, true, false, true])).toMatchObject({ step: 1, right: 1, wrong: 0 });
    expect(moveStep({ step: 2, right: 0, wrong: 2 }, true)).toMatchObject({ step: 2, right: 1, wrong: 0 });
  });
});

describe("today's count, Korean day (D36)", () => {
  const midnight = kstMidnight("2026-10-28");
  it("keeps counting on the same day and starts again at 00:00 KST", () => {
    expect(countedToday("2026-10-27", 150, midnight - 1)).toBe(150);
    expect(countedToday("2026-10-27", 150, midnight)).toBe(0);
    expect(countedToday(null, 0, midnight)).toBe(0);
  });
});
