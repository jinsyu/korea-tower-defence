// Problem panel and my-guardian state (T7): panel sizes at phone sizes (D41), header without levels (D42),
// the fake answer rules the panel shows, and one store behind the board, the representative list and the level bar.
import { readFileSync } from "node:fs";
import {
  estimateLabelSize,
  generateProblem,
  fitBoard,
  fixedRects,
  isWide,
  labelOverlaps,
  layoutStageLabels,
  mapBox,
  overlapArea,
  panelMetrics,
  parseStageFile,
  phoneSideHeight,
  type StageFile,
} from "@ktd/core";
import { describe, expect, it } from "vitest";
import { GRADE_BANDS } from "@/lib/grade-bands";
import { josa, type Problem } from "@ktd/core";
import { spoken } from "./spoken";
import { FAKE_ME, fakeGuardians } from "./fake-region";
import {
  advanceDelay,
  answerProblem,
  markShown,
  newPanel,
  NEXT_AFTER_MS,
  nextProblem,
  panelHeader,
  resumeAfterReconnect,
  TOO_FAST_MS,
  type PanelState,
} from "./math-panel";
import {
  boardTowerInputs,
  createMeStore,
  gainPoints,
  meBarView,
  repRows,
  upCost,
  upgradeChange,
  type Me,
} from "./me-store";

const stage: StageFile = parseStageFile(
  JSON.parse(readFileSync(new URL("../../../public/stages/dev/32540.json", import.meta.url), "utf8")),
);

const PHONES: [number, number][] = [
  [360, 640],
  [390, 844],
];

describe.each(PHONES)("problem panel at %i×%i (D41)", (vw, vh) => {
  it.each([false, true])("fits under the board on one screen (fractions %s)", (fractions) => {
    const box = mapBox(vw, vh, fractions);
    // padding 6 top, rows bug / strip / map / side with gap 4, padding 6 bottom.
    expect(box.y + box.h + 4 + phoneSideHeight(vw, vh, fractions) + 6).toBeCloseTo(vh, 5);
    expect(box.h / vh).toBeGreaterThanOrEqual(0.4);
  });

  it("uses 32px expressions, 20px fraction digits and big 2×2 choices", () => {
    const m = panelMetrics(vw, vh, true);
    expect(m.exprPx).toBeGreaterThanOrEqual(32);
    expect(m.fracPx).toBeGreaterThanOrEqual(20);
    expect(m.choicePx).toBeGreaterThanOrEqual(vh <= 700 ? 56 : 64);
    // A stacked fraction (2.23 em) fits its row.
    expect(m.fracPx * 2.23).toBeLessThanOrEqual(m.exprRowPx);
  });

  it("keeps solution fractions at 20px or more inside the fixed choice row", () => {
    const m = panelMetrics(vw, vh, true);
    expect(m.solutionFracPx).toBeGreaterThanOrEqual(20);
    // The solution takes the second choice row (fixed height), so a wrong answer leaves the panel height alone.
    expect(panelMetrics(vw, vh, true).panelPx).toBe(m.panelPx);
  });

  it("keeps spots and labels right on the 5~6 band board too (D63)", () => {
    const box = mapBox(vw, vh, true);
    const v = fitBoard(box.w, box.h, stage.board);
    expect(v.D).toBeGreaterThanOrEqual(44);
    const spots = [...stage.repSpots, stage.mySpot].map(([x, y]) => [v.ox + x * v.s, v.oy + y * v.s] as const);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(Math.hypot(spots[i]![0] - spots[j]![0], spots[i]![1] - spots[j]![1]) - v.D).toBeGreaterThanOrEqual(8);
      }
    }
    const rects = layoutStageLabels(stage, v, estimateLabelSize(isWide(vw, vh))).map((l) => l.rect);
    const fixed = fixedRects(stage, v);
    expect(labelOverlaps(rects, fixed.spots)).toBe(0);
    expect(labelOverlaps(rects, fixed.gates)).toBe(0);
    expect(labelOverlaps(rects, [fixed.base])).toBe(0);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlapArea(rects[i]!, rects[j]!)).toBeLessThanOrEqual(0.5);
  });
});

describe("panel CSS matches the metrics (D41)", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
  it.each([".mq-expr .fr", ".mq-opt .fr", ".mq-sol .fr"])("gives %s a 20px floor", (sel) => {
    const rule = css.slice(css.indexOf(`${sel} {`));
    expect(rule.slice(0, rule.indexOf("}"))).toMatch(/font-size:\s*max\(20px,/);
  });
});

describe("problem panel on wide screens (D41)", () => {
  it.each([
    [1024, 768],
    [1440, 900],
    [1920, 1080],
  ])("%i×%i: choices 64px or more, TV expression 48px or more", (vw, vh) => {
    const m = panelMetrics(vw, vh, true);
    expect(m.choicePx).toBeGreaterThanOrEqual(64);
    expect(m.exprPx).toBeGreaterThanOrEqual(48);
    expect(m.fracPx).toBeGreaterThanOrEqual(20);
  });
});

/** Rough width of the header text at 14px black: Hangul 14px, other characters 8px, spaces 4px. */
const headerWidth = (text: string) => [...text].reduce((w, c) => w + (/[가-힣]/.test(c) ? 14 : c === " " ? 4 : 8), 0);
/** 360px: 344px row − "문제" tag 50px − skip button 88px − text padding 20px. */
const HEADER_ROOM_360 = 344 - 50 - 88 - 20;

/** Generated problems of every band and level, many seeds. */
const SAMPLE_PROBLEMS: Problem[] = (["12", "34", "56"] as const).flatMap((band) =>
  ([1, 2, 3] as const).flatMap((level) => Array.from({ length: 200 }, (_, seed) => generateProblem(band, level, seed))),
);

describe("header line (D42)", () => {
  const panelFor = (p: Problem): PanelState => ({ ...newPanel(p.band, 0, p.level), problem: p });

  it("is \"학년군 · 유형\" for every problem, with no level number or level word", () => {
    for (const p of SAMPLE_PROBLEMS) {
      const h = panelHeader(panelFor(p), 0);
      const band = GRADE_BANDS.find((b) => b.id === p.band)!.label;
      expect(h.text).toBe(`${band} · ${p.type}`);
      expect(h.text).not.toMatch(/단계|레벨|Lv|level|[1-3]\s*단(?!원)/i);
    }
  });

  it("reads the same at every level of a type", () => {
    const byType = new Map<string, Set<string>>();
    for (const p of SAMPLE_PROBLEMS) {
      const key = `${p.band}|${p.type}`;
      byType.set(key, (byType.get(key) ?? new Set()).add(panelHeader(panelFor(p), 0).text));
    }
    for (const texts of byType.values()) expect(texts.size).toBe(1);
  });

  it("fits one line at 360px without an ellipsis", () => {
    for (const p of SAMPLE_PROBLEMS) expect(headerWidth(panelHeader(panelFor(p), 0).text)).toBeLessThanOrEqual(HEADER_ROOM_360);
  });

  it("borrows the line for the guess pause (with time left) and the daily notice", () => {
    const s = newPanel("12", 0);
    expect(panelHeader({ ...s, pausedUntil: 300_000 }, 1000)).toEqual({ text: "포인트 멈춤 4:59 · 문제를 천천히 읽어 봐요", tone: "warn" });
    expect(panelHeader({ ...s, daily: true }, 0).tone).toBe("info");
    expect(panelHeader({ ...s, pausedUntil: 300_000 }, 300_000).tone).toBe("plain");
  });
});

describe("spoken math", () => {
  it("reads fractions and mixed numbers aloud", () => {
    expect(spoken([{ fr: [3, 4] }, " + ", { fr: [1, 2] }])).toBe("4분의 3 더하기 2분의 1");
    expect(spoken([{ fr: [3, 4], w: 1 }, " − ", { fr: [1, 3], w: 2 }])).toBe("1과 4분의 3 빼기 2와 3분의 1");
  });

  it("reads \"=\" as 은 or 는 to fit the word before it", () => {
    const blank = { blank: true } as const;
    expect(spoken(["4.32 ÷ 3.6 = ", blank])).toBe("4.32 나누기 3.6은 빈칸");
    expect(spoken(["7 × 8 = ", blank])).toBe("7 곱하기 8은 빈칸");
    expect(spoken(["4 × 9 = ", blank])).toBe("4 곱하기 9는 빈칸");
    expect(spoken([{ fr: [3, 4] }, " + ", { fr: [1, 2] }, " = ", blank])).toBe("4분의 3 더하기 2분의 1은 빈칸");
    expect(spoken([{ fr: [2, 5], w: 1 }, " × 3 = ", blank])).toBe("1과 5분의 2 곱하기 3은 빈칸");
    expect(spoken([{ fr: [3, 5] }, " × 2 = ", blank])).toBe("5분의 3 곱하기 2는 빈칸");
    expect(spoken([blank, " × 4 = 28"])).toBe("빈칸 곱하기 4는 28");
    expect(spoken(["0.25 × 0.4 = ", blank])).toBe("0.25 곱하기 0.4는 빈칸");
  });

  it("picks the particle after \"=\" right in every band's expressions", () => {
    for (const p of SAMPLE_PROBLEMS) {
      const s = spoken(p.expr);
      expect(s, p.key).not.toMatch(/ 는 | = /);
      const m = /(\S+?)(은|는) /.exec(s);
      expect(m, `${p.key} → ${s}`).not.toBeNull();
      expect(josa(m![1]!, "은"), `${p.key} → ${s}`).toBe(m![1]! + m![2]!);
    }
  });

  it("deals 5~6학년 problems from the generator on the panel", () => {
    expect(newPanel("56", 0, 1).problem.type).toMatch(/^분수 (덧셈|뺄셈)$/);
    expect(newPanel("56", 0, 3).problem.type).toMatch(/^(분수|소수) 나눗셈$/);
  });
});

describe("answer rules on the panel (fake until T12)", () => {
  const SLOW = 4000;
  const answerRight = (s: PanelState, now = s.shownAt + SLOW) => answerProblem(s, s.problem.answer, now);
  const answerWrong = (s: PanelState, now = s.shownAt + SLOW) => answerProblem(s, (s.problem.answer + 1) % 4, now);

  it("gives 10 / 12 / 15 points by level, nothing for a wrong answer", () => {
    expect(answerRight(newPanel("12", 1000, 1)).answered.points).toBe(10);
    expect(answerRight(newPanel("12", 1000, 2)).answered.points).toBe(12);
    expect(answerRight(newPanel("12", 1000, 3)).answered.points).toBe(15);
    expect(answerWrong(newPanel("12", 1000, 2)).answered).toMatchObject({ correct: false, points: 0 });
  });

  it("gives no points and keeps streaks for a too-fast answer", () => {
    const s = { ...newPanel("12", 1000, 1), streak: 4 };
    const fast = answerRight(s, s.shownAt + TOO_FAST_MS - 1);
    expect(fast.answered).toMatchObject({ correct: true, points: 0, note: "천천히 풀어도 괜찮아요" });
    expect(fast.state.streak).toBe(4);
    expect(answerRight(s, s.shownAt + TOO_FAST_MS).answered.points).toBe(10);
  });

  it("counts the first problem as too fast until it is shown, then from the moment it is shown", () => {
    const s = newPanel("12", 0, 1);
    expect(answerRight(s, 5000).answered.points).toBe(0);
    const shown = markShown(s, 10_000);
    expect(answerRight(shown, 10_000).answered).toMatchObject({ points: 0, note: "천천히 풀어도 괜찮아요" });
    expect(answerRight(shown, 10_000 + TOO_FAST_MS - 1).state.streak).toBe(0);
    const ok = answerRight(shown, 10_000 + TOO_FAST_MS);
    expect(ok.answered.points).toBe(10);
    expect(ok.state.streak).toBe(1);
  });

  it("holds the next problem while offline and resumes with a full pause after reconnecting (D58)", () => {
    const s = markShown(newPanel("12", 1000, 1), 1000);
    const right = answerRight(s, 5000).state;
    expect(advanceDelay(right, false, 5000)).toBe(NEXT_AFTER_MS);
    // Connection lost right after the answer: nothing is scheduled, however long it stays offline.
    expect(advanceDelay(right, true, 5100)).toBeNull();
    expect(advanceDelay(right, true, 60_000)).toBeNull();
    // Back online: the same answered problem stays a full pause, then the next one comes.
    const back = resumeAfterReconnect(right, 60_000);
    expect(back.problem).toBe(right.problem);
    expect(advanceDelay(back, false, 60_000)).toBe(NEXT_AFTER_MS);
    expect(nextProblem(back, 61_000).advanceAt).toBeNull();
    // A wrong answer never advances on its own.
    expect(answerWrong(s, 5000).state.advanceAt).toBeNull();
    expect(resumeAfterReconnect(s, 9000)).toBe(s);
  });

  it("halves points on the daily notice and pauses them on a guess pause", () => {
    expect(answerRight({ ...newPanel("12", 1000, 2), daily: true }).answered.points).toBe(6);
    expect(answerRight({ ...newPanel("12", 1000, 2), pausedUntil: 1e9 }).answered).toMatchObject({ points: 0, note: "포인트 멈춤 중" });
  });

  it("moves up after 5 right and down after 3 wrong, keeping the open problem until the next one", () => {
    const up = answerRight({ ...newPanel("12", 1000, 2), streak: 4 });
    expect(up.levelUp).toBe(true);
    expect(up.state.level).toBe(3);
    expect(up.state.problem.level).toBe(2);
    expect(nextProblem(up.state, 9000).problem.level).toBe(3);
    const down = answerWrong({ ...newPanel("12", 1000, 2), wrongStreak: 2 });
    expect(down.levelDown).toBe(true);
    expect(nextProblem(down.state, 9000).problem.level).toBe(1);
  });

  it("skips without points and without touching streaks", () => {
    const s = { ...newPanel("34", 1000, 1), streak: 3, wrongStreak: 1 };
    const next = nextProblem(s, 100);
    expect(next).toMatchObject({ streak: 3, wrongStreak: 1, answered: null, shownAt: 100 });
    expect(next.problem).not.toBe(s.problem);
  });
});

describe("one store for my guardian (plan memo: evolve demo)", () => {
  const guardians = fakeGuardians(1000);
  const n = stage.repSpots.length;

  /** The step each place shows: the board's my tower, the "나" row and the level bar. */
  function shownSteps(me: Me) {
    const board = boardTowerInputs(stage, guardians, me).filter((t) => t.me);
    const rows = repRows(guardians, me, n).filter((r) => r.me);
    expect(board).toHaveLength(1);
    expect(rows).toHaveLength(1);
    return { board: board[0]!.step, row: rows[0]!.step, bar: meBarView(me).step };
  }

  it.each([
    ["on my spot", 0],
    ["as a representative", 1e9],
  ])("shows the same step in all three places after evolving %s", (_, pts24) => {
    const store = createMeStore({ ...FAKE_ME, pts24, step: 99, wallet: upCost(99) - 5 });
    let calls = 0;
    store.subscribe(() => calls++);
    expect(shownSteps(store.get())).toEqual({ board: 99, row: 99, bar: 99 });
    const gain = gainPoints(store.get(), 12);
    store.set(gain.me);
    expect(calls).toBe(1);
    expect(upgradeChange(gain.fromStep, gain.me.step)?.kind).toBe("evo");
    expect(shownSteps(store.get())).toEqual({ board: 100, row: 100, bar: 100 });
  });

  it("puts my row under the list only when I am not a representative", () => {
    const mine = repRows(guardians, { ...FAKE_ME, pts24: 0 }, n);
    expect(mine).toHaveLength(n + 1);
    expect(mine.at(-1)).toMatchObject({ me: true, rank: null });
    const rep = repRows(guardians, { ...FAKE_ME, pts24: 1e9 }, n);
    expect(rep).toHaveLength(n);
    expect(rep[0]).toMatchObject({ me: true, rank: 1 });
  });

  it("raises several steps at once and keeps the rest in the wallet (D48)", () => {
    const me: Me = { ...FAKE_ME, step: 10, wallet: 0 };
    const pts = upCost(10) + upCost(11) + 3;
    const after = gainPoints(me, pts).me;
    expect(after.step).toBe(12);
    expect(after.wallet).toBe(3);
  });

  it.each([
    [47, 48, "up"],
    [54, 55, "look"],
    [49, 50, "mat"],
    [99, 100, "evo"],
  ] as const)("names the change %i → %i as %s", (from, to, kind) => {
    expect(upgradeChange(from, to)?.kind).toBe(kind);
  });
});
