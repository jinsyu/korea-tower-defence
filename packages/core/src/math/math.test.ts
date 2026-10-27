// Math generators for grades 1~2 and 3~4 (T9-1): D27 table, D28 band range, D29 answers and choices,
// D30 number ranges, D31 variety and notation. Every check runs on 10,000 fixed seeds per level and type.
import { describe, expect, it } from "vitest";
import { generateProblem, josa, MATH_LEVELS, plainText, type ChoiceValue, type MathLevel, type Problem } from "../index";

const SEEDS = 10_000;
const BANDS = ["12", "34"] as const;
const LEVELS: MathLevel[] = [1, 2, 3];

type Band = (typeof BANDS)[number];
/** Every level and type: 3~4학년 level 3 has two (곱셈, 나눗셈), each checked on its own 10,000 seeds. */
const GROUPS = MATH_LEVELS.filter((l) => (BANDS as readonly string[]).includes(l.band)).flatMap((l) =>
  l.types.map((t) => [l.band as Band, l.level, t.name] as const),
);

const batch = new Map<string, Problem[]>();
function problems(band: Band, level: MathLevel, type: string): Problem[] {
  const k = `${band}${level}${type}`;
  if (!batch.has(k)) batch.set(k, Array.from({ length: SEEDS }, (_, seed) => generateProblem(band, level, seed, type)));
  return batch.get(k)!;
}

/** The question, solved here again from the expression text alone (not from the generator's numbers). */
type Solved =
  | { kind: "mul"; a: number; b: number; value: number }
  | { kind: "missing"; b: number; c: number; value: number }
  | { kind: "div"; dividend: number; divisor: number; value: { q: number; r: number } };

function solve(p: Problem): Solved {
  const s = plainText(p.expr);
  let m = /^(\d+) × (\d+) = □$/.exec(s);
  if (m) return { kind: "mul", a: +m[1]!, b: +m[2]!, value: +m[1]! * +m[2]! };
  m = /^□ × (\d+) = (\d+)$/.exec(s);
  if (m) {
    const b = +m[1]!;
    const c = +m[2]!;
    expect(c % b).toBe(0);
    return { kind: "missing", b, c, value: c / b };
  }
  m = /^(\d+) ÷ (\d+) = □$/.exec(s);
  if (m) {
    const dividend = +m[1]!;
    const divisor = +m[2]!;
    return { kind: "div", dividend, divisor, value: { q: Math.floor(dividend / divisor), r: dividend % divisor } };
  }
  throw new Error(`unexpected expression: ${s}`);
}

const digits = (n: number) => String(n).length;
const digitList = (n: number) => String(n).split("").map(Number).reverse();

/**
 * Multiplication slips worked out here from the digits, apart from the generator:
 * carries dropped (each row, both rows, or in adding the rows), carry added before multiplying, tens only adding the
 * carry, the two products written side by side, the tens row not shifted, and same-place digits multiplied only.
 */
function slips(a: number, b: number): number[] {
  const noCarry = (x: number, d: number) =>
    digitList(x).reduce((sum, v, i, all) => sum + (i === all.length - 1 ? v * d : (v * d) % 10) * 10 ** i, 0);
  if (b < 10) {
    const [o, t] = digitList(a) as [number, number];
    const carry = Math.floor((o * b) / 10);
    return [noCarry(a, b), (t + carry) * b * 10 + ((o * b) % 10), Number(`${t * b}${o * b}`), (t + carry) * 10 + ((o * b) % 10)];
  }
  const [b1, b10] = digitList(b) as [number, number];
  const p1 = a * b1;
  const p2 = a * b10 * 10;
  const addNoCarry = (x: number, y: number) => {
    const xs = digitList(x);
    const ys = digitList(y);
    return Array.from({ length: Math.max(xs.length, ys.length) }, (_, i) => (((xs[i] ?? 0) + (ys[i] ?? 0)) % 10) * 10 ** i).reduce((u, v) => u + v, 0);
  };
  const out = [p1 + a * b10, noCarry(a, b1) + noCarry(a, b10) * 10, noCarry(a, b1) + p2, p1 + noCarry(a, b10) * 10, addNoCarry(p1, p2)];
  if (a < 100) out.push(Math.floor(a / 10) * b10 * 100 + (a % 10) * b1);
  return out;
}
const same = (a: ChoiceValue, b: ChoiceValue) => JSON.stringify(a) === JSON.stringify(b);
/** Off by one: a number ±1, or a quotient-remainder pair with exactly one part off by one. */
const nearOne = (a: ChoiceValue, b: ChoiceValue) =>
  typeof a === "number" && typeof b === "number"
    ? Math.abs(a - b) === 1
    : typeof a === "object" && typeof b === "object" && Math.abs(a.q - b.q) + Math.abs(a.r - b.r) === 1;
const shown = (v: ChoiceValue): string => (typeof v === "number" ? String(v) : `몫 ${v.q} 나머지 ${v.r}`);

describe("level table (D27)", () => {
  it("has three levels per band, each type with a name and a standard code", () => {
    for (const band of BANDS) {
      const rows = MATH_LEVELS.filter((l) => l.band === band);
      expect(rows.map((r) => r.level)).toEqual([1, 2, 3]);
      for (const r of rows) {
        expect(r.types.length).toBeGreaterThan(0);
        for (const t of r.types) {
          expect(t.name).toMatch(/^[가-힣 ]+$/);
          expect(t.standards.length).toBeGreaterThan(0);
          for (const code of t.standards) expect(code).toMatch(/^\[\d수\d\d-\d\d\]$/);
        }
      }
    }
  });

  it("matches the spec table", () => {
    const rows = MATH_LEVELS.map((l) => `${l.band}-${l.level} ${l.types.map((t) => `${t.name} ${t.standards.join(" ")}`).join(" / ")}`);
    expect(rows).toEqual([
      "12-1 곱셈구구 [2수01-11]",
      "12-2 곱셈구구 [2수01-11]",
      "12-3 곱셈구구 [2수01-11]",
      "34-1 곱셈 [4수01-04]",
      "34-2 나눗셈 [4수01-05] [4수01-06]",
      "34-3 곱셈 [4수01-04] / 나눗셈 [4수01-07]",
    ]);
  });

  it("gives every problem the type name and standards of its level", () => {
    for (const [band, level, type] of GROUPS) {
      const t = MATH_LEVELS.find((l) => l.band === band && l.level === level)!.types.find((x) => x.name === type)!;
      for (const p of problems(band, level, type)) {
        expect([p.band, p.level, p.type]).toEqual([band, level, type]);
        expect(p.standards).toEqual(t.standards);
      }
    }
  });

  it("mixes 곱셈 and 나눗셈 about half and half at 3~4학년 level 3", () => {
    let mul = 0;
    for (let seed = 0; seed < SEEDS; seed++) if (generateProblem("34", 3, seed).type === "곱셈") mul++;
    expect(mul / SEEDS).toBeGreaterThan(0.45);
    expect(mul / SEEDS).toBeLessThan(0.55);
  });
});

describe("same seed, same problem", () => {
  it("is deterministic", () => {
    for (const band of BANDS) for (const level of LEVELS) expect(generateProblem(band, level, 42)).toEqual(generateProblem(band, level, 42));
    for (const [band, level, type] of GROUPS) expect(generateProblem(band, level, 42, type)).toEqual(generateProblem(band, level, 42, type));
  });
});

describe.each(GROUPS)("band %s level %i %s", (band, level, type) => {
  it("has exactly one right choice, four different values, choices drawn as their values (D29)", () => {
    for (const p of problems(band, level, type)) {
      const truth = solve(p).value;
      expect(p.values.filter((v) => same(v, truth)), p.key).toHaveLength(1);
      expect(same(p.values[p.answer], truth), p.key).toBe(true);
      expect(new Set(p.values.map((v) => JSON.stringify(v))).size, p.key).toBe(4);
      p.choices.forEach((c, i) => expect(plainText(c)).toBe(shown(p.values[i]!)));
    }
  });

  it("keeps wrong choices sensible: no negatives, no 0 for answers of 2 or more, at most one ±1, remainders under the divisor (D29)", () => {
    for (const p of problems(band, level, type)) {
      const s = solve(p);
      const wrongs = p.values.filter((_, i) => i !== p.answer);
      expect(wrongs.filter((w) => nearOne(w, s.value)).length, p.key).toBeLessThanOrEqual(1);
      for (const w of wrongs) {
        if (typeof w === "number") {
          expect(Number.isInteger(w) && w >= 0, p.key).toBe(true);
          if ((s.value as number) >= 2) expect(w, p.key).not.toBe(0);
        } else {
          expect(s.kind).toBe("div");
          const divisor = (s as Extract<Solved, { kind: "div" }>).divisor;
          expect(w.q, p.key).toBeGreaterThanOrEqual(1);
          expect(w.r, p.key).toBeGreaterThanOrEqual(0);
          expect(w.r, p.key).toBeLessThan(divisor);
        }
      }
    }
  });

  it("puts the answer at each position 25% ± 3% of the time (D31)", () => {
    const counts = [0, 0, 0, 0];
    for (const p of problems(band, level, type)) counts[p.answer]!++;
    for (const c of counts) expect(Math.abs(c / SEEDS - 0.25)).toBeLessThanOrEqual(0.03);
  });

  it("has at least 18 different problems (D31)", () => {
    expect(new Set(problems(band, level, type).map((p) => p.key)).size).toBeGreaterThanOrEqual(18);
  });

  it("has no particle placeholder and picks particles by the sound of the number before them (D31)", () => {
    for (const p of problems(band, level, type)) {
      const texts = [p.expr, ...p.choices, p.solution.text, p.solution.result].map(plainText);
      for (const t of texts) {
        expect(t, p.key).not.toMatch(/\((을|를|이|가|은|는|과|와|으로|로)\)/);
        // Read aloud: 2 이, 4 사, 5 오, 9 구 end in a vowel; the other digits (and 십, 백, 천) end in a consonant.
        expect(t, p.key).not.toMatch(/[2459](을|은|과|이에요)(?![가-힣])/);
        expect(t, p.key).not.toMatch(/[013678](를|는|와|예요)(?![가-힣])/);
      }
    }
  });
});

describe("band range (D28) and number ranges (D30)", () => {
  it("1~2학년 asks only the times tables: one-digit factors, no division, no fractions or decimals", () => {
    for (const level of LEVELS) {
      for (const p of problems("12", level, "곱셈구구")) {
        const s = solve(p);
        expect(s.kind === "mul" || s.kind === "missing", p.key).toBe(true);
        const factors = s.kind === "mul" ? [s.a, s.b] : s.kind === "missing" ? [s.b, s.value] : [];
        for (const f of factors) expect(f >= 0 && f <= 9, p.key).toBe(true);
        for (const w of p.values) expect(typeof w === "number" && w <= 99, p.key).toBe(true);
      }
    }
  });

  it("1~2학년 level 1 uses only the 2·3·4·5 tables, level 2 only 6·7·8·9, level 3 mixes with 0, 1 and □", () => {
    for (const p of problems("12", 1, "곱셈구구")) expect([2, 3, 4, 5]).toContain((solve(p) as { a: number }).a);
    for (const p of problems("12", 2, "곱셈구구")) expect([6, 7, 8, 9]).toContain((solve(p) as { a: number }).a);
    const kinds = { zeroOne: 0, missing: 0, mixed: 0 };
    for (const p of problems("12", 3, "곱셈구구")) {
      const s = solve(p);
      if (s.kind === "missing") kinds.missing++;
      else if (s.kind === "mul" && (s.a <= 1 || s.b <= 1)) kinds.zeroOne++;
      else kinds.mixed++;
    }
    for (const n of Object.values(kinds)) expect(n / SEEDS).toBeGreaterThan(0.15);
  });

  it("3~4학년 level 1 multiplies a two-digit number by a one- or two-digit number", () => {
    let twoDigit = 0;
    for (const p of problems("34", 1, "곱셈")) {
      const s = solve(p);
      expect(s.kind).toBe("mul");
      const { a, b } = s as Extract<Solved, { kind: "mul" }>;
      expect(digits(a)).toBe(2);
      expect([1, 2]).toContain(digits(b));
      if (digits(b) === 2) twoDigit++;
    }
    expect(twoDigit / SEEDS).toBeGreaterThan(0.3);
    expect(twoDigit / SEEDS).toBeLessThan(0.7);
  });

  it("3~4학년 level 2 divides a two-digit number by a one-digit number, 30% or more with a remainder", () => {
    let withRemainder = 0;
    for (const p of problems("34", 2, "나눗셈")) {
      const s = solve(p);
      expect(s.kind).toBe("div");
      const d = s as Extract<Solved, { kind: "div" }>;
      expect(digits(d.dividend)).toBe(2);
      expect(digits(d.divisor)).toBe(1);
      expect(d.divisor).toBeGreaterThanOrEqual(2);
      if (d.value.r > 0) withRemainder++;
    }
    expect(withRemainder / SEEDS).toBeGreaterThanOrEqual(0.3);
  });

  it("3~4학년 level 3 is (three-digit)×(two-digit) or (two- or three-digit)÷(two-digit)", () => {
    for (const p of problems("34", 3, "곱셈")) {
      const s = solve(p);
      expect(s.kind).toBe("mul");
      const { a, b } = s as Extract<Solved, { kind: "mul" }>;
      expect([digits(a), digits(b)], p.key).toEqual([3, 2]);
    }
    for (const p of problems("34", 3, "나눗셈")) {
      const s = solve(p);
      expect(s.kind).toBe("div");
      const d = s as Extract<Solved, { kind: "div" }>;
      expect([2, 3]).toContain(digits(d.dividend));
      expect(digits(d.divisor)).toBe(2);
    }
  });

  it("3~4학년 곱셈 wrong answers are all slips children make, never a number picked near the answer", () => {
    for (const level of [1, 3] as const) {
      for (const p of problems("34", level, "곱셈")) {
        const { a, b } = solve(p) as Extract<Solved, { kind: "mul" }>;
        const known = slips(a, b);
        p.values.forEach((v, i) => {
          if (i !== p.answer) expect(known, `${p.key} ${String(v)}`).toContain(v);
        });
      }
    }
  });

  it("3~4학년 never shows fractions or decimals", () => {
    for (const [, level, type] of GROUPS.filter(([band]) => band === "34")) {
      for (const p of problems("34", level, type)) {
        for (const t of [p.expr, ...p.choices, p.solution.text, p.solution.result]) {
          expect(t.some((tok) => typeof tok === "object" && "fr" in tok)).toBe(false);
          expect(plainText(t), p.key).not.toMatch(/\d\.\d/);
        }
      }
    }
  });
});

describe("solutions", () => {
  it("end with the right answer", () => {
    for (const [band, level, type] of GROUPS) {
      for (const p of problems(band, level, type).slice(0, 2000)) {
        const v = solve(p).value;
        const result = plainText(p.solution.result);
        if (typeof v === "number") expect(result, p.key).toMatch(new RegExp(`(^|= )${v}$|^${v} ×`));
        else expect(result, p.key).toBe(`몫 ${v.q}, 나머지 ${v.r}`);
      }
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
