// Times-table generator (spec 4판, T13-3): D27 table, D28·D30 ranges, D29 answers and choices, D31 variety and
// notation. Every check runs on 10,000 fixed seeds per level.
import { describe, expect, it } from "vitest";
import { generateProblem, josa, MATH_LEVELS, plainText, type MathLevel, type MathText, type Problem } from "../index";

const SEEDS = 10_000;
const LEVELS: MathLevel[] = [1, 2, 3];

const batch = new Map<MathLevel, Problem[]>();
function problems(level: MathLevel): Problem[] {
  if (!batch.has(level)) batch.set(level, Array.from({ length: SEEDS }, (_, seed) => generateProblem(level, seed)));
  return batch.get(level)!;
}

/** The question, solved here again from the expression text alone: only "a × b = □" is allowed. */
function solve(p: Problem): { a: number; b: number; value: number } {
  const m = /^(\d+) × (\d+) = □$/.exec(plainText(p.expr));
  if (!m) throw new Error(`unexpected expression: ${plainText(p.expr)}`);
  const [a, b] = [Number(m[1]), Number(m[2])];
  return { a, b, value: a * b };
}

/** Every text of a problem: expression, choices and solution. */
const texts = (p: Problem): MathText[] => [p.expr, ...p.choices, p.solution.text, p.solution.result];

describe("level table (D27)", () => {
  it("has three levels of one type, 곱셈구구 [2수01-11]", () => {
    expect(MATH_LEVELS.map((l) => `${l.level} ${l.tables.join("·")}`)).toEqual(["1 2·5·3·4", "2 6·7·8·9", "3 2·3·4·5·6·7·8·9"]);
    for (const level of LEVELS) {
      for (const p of problems(level)) {
        expect([p.level, p.type], p.key).toEqual([level, "곱셈구구"]);
        expect(p.standards).toEqual(["[2수01-11]"]);
      }
    }
  });
});

describe("same seed, same problem", () => {
  it("is deterministic", () => {
    for (const level of LEVELS) expect(generateProblem(level, 42)).toEqual(generateProblem(level, 42));
  });
});

describe("number ranges (D28, D30)", () => {
  it.each([
    [1, [2, 3, 4, 5]],
    [2, [6, 7, 8, 9]],
    [3, [2, 3, 4, 5, 6, 7, 8, 9]],
  ] as const)("level %i asks only the tables %j, every one of them, times 1~9", (level, tables) => {
    const seenA = new Set<number>();
    const seenB = new Set<number>();
    for (const p of problems(level)) {
      const { a, b } = solve(p);
      seenA.add(a);
      seenB.add(b);
    }
    expect([...seenA].sort()).toEqual([...tables]);
    expect([...seenB].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("never asks a blank factor (□ × b = c), a 0 or a 1 table, nor anything but a × b = □", () => {
    for (const level of LEVELS) {
      for (const p of problems(level)) {
        expect(p.expr, p.key).toEqual([expect.stringMatching(/^[2-9] × [1-9] = $/), { blank: true }]);
        const { a, b } = solve(p);
        expect(a, p.key).toBeGreaterThanOrEqual(2);
        expect(b, p.key).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe.each(LEVELS)("level %i", (level) => {
  it("has exactly one right choice, four different values, choices drawn as their values (D29)", () => {
    for (const p of problems(level)) {
      const truth = solve(p).value;
      expect(p.values.filter((v) => v === truth), p.key).toHaveLength(1);
      expect(p.values[p.answer], p.key).toBe(truth);
      expect(new Set(p.values).size, p.key).toBe(4);
      p.choices.forEach((c, i) => expect(plainText(c), p.key).toBe(String(p.values[i])));
    }
  });

  it("keeps wrong choices sensible: whole numbers from 1 to 99, at most one ±1 (D29)", () => {
    for (const p of problems(level)) {
      const truth = solve(p).value;
      const wrongs = p.values.filter((_, i) => i !== p.answer);
      expect(wrongs.filter((w) => Math.abs(w - truth) === 1).length, p.key).toBeLessThanOrEqual(1);
      for (const w of wrongs) expect(Number.isInteger(w) && w >= 1 && w <= 99, p.key).toBe(true);
    }
  });

  it("puts the answer at each position 25% ± 3% of the time (D31)", () => {
    const counts = [0, 0, 0, 0];
    for (const p of problems(level)) counts[p.answer]!++;
    for (const c of counts) expect(Math.abs(c / SEEDS - 0.25)).toBeLessThanOrEqual(0.03);
  });

  it("has at least 18 different problems (D31)", () => {
    expect(new Set(problems(level).map((p) => p.key)).size).toBeGreaterThanOrEqual(18);
  });

  it("has no particle placeholder and picks particles by the sound of the number before them (D31)", () => {
    for (const p of problems(level)) {
      for (const t of texts(p).map(plainText)) {
        expect(t, p.key).not.toMatch(/\((을|를|이|가|은|는|과|와|으로|로)\)/);
        // Read aloud: 2 이, 4 사, 5 오, 9 구 end in a vowel; the other digits (and 십, 백, 천) end in a consonant.
        expect(t, p.key).not.toMatch(/[2459](을|은|과|이에요)(?![가-힣])/);
        expect(t, p.key).not.toMatch(/[013678](를|는|와|예요)(?![가-힣])/);
      }
    }
  });

  it("ends the solution with the right answer", () => {
    for (const p of problems(level)) {
      const { value } = solve(p);
      expect(plainText(p.solution.result), p.key).toMatch(new RegExp(`= ${value}$`));
    }
  });
});

describe("josa", () => {
  it("reads numbers aloud to pick the particle", () => {
    expect([2, 4, 5, 9].map((n) => josa(n, "을"))).toEqual(["2를", "4를", "5를", "9를"]);
    expect([0, 1, 3, 6, 7, 8, 10, 100, 1000].map((n) => josa(n, "을"))).toEqual(["0을", "1을", "3을", "6을", "7을", "8을", "10을", "100을", "1000을"]);
    expect([josa(3, "이에요"), josa(2, "이에요"), josa(7, "은"), josa(4, "은"), josa(48, "이"), josa(36, "과")]).toEqual([
      "3이에요",
      "2예요",
      "7은",
      "4는",
      "48이",
      "36과",
    ]);
    expect([josa(1, "으로"), josa(3, "으로"), josa(5, "으로"), josa(10, "으로")]).toEqual(["1로", "3으로", "5로", "10으로"]);
    expect([josa("몫", "이"), josa("나머지", "이"), josa("곱셈구구", "을"), josa("한 줄", "으로")]).toEqual(["몫이", "나머지가", "곱셈구구를", "한 줄로"]);
  });
});
