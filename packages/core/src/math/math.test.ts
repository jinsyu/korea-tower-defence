// Math generators for every grade band (T9-1, T9-2): D27 table, D28 band range, D29 answers and choices,
// D30 number ranges, D31 variety and notation. Every check runs on 10,000 fixed seeds per level and type.
import { describe, expect, it } from "vitest";
import { generateProblem, josa, MATH_LEVELS, plainText, type ChoiceValue, type MathLevel, type MathText, type Problem, type Rational } from "../index";
import { decimalQuotientSlips } from "./generators/decimal-divide";
import { decimalProductSlips, type Dec } from "./generators/decimal-multiply";
import { additionSlips, subtractionSlips, type Operand } from "./generators/fraction-add";
import { fractionQuotientSlips, type FractionQuotient } from "./generators/fraction-divide";
import { fractionProductSlips, type FractionProduct } from "./generators/fraction-multiply";
import { add, decimalPlaces, div, fromDecimal, mixed, mul, rat, sub, toDecimal } from "./rational";

const SEEDS = 10_000;
const BANDS = ["12", "34", "56"] as const;
const LEVELS: MathLevel[] = [1, 2, 3];

type Band = (typeof BANDS)[number];
/** Every level and type: 3~4학년 level 3 and every 5~6학년 level have two, each checked on its own 10,000 seeds. */
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
  | { kind: "div"; dividend: number; divisor: number; value: { q: number; r: number } }
  | { kind: "56"; op: "+" | "−" | "×" | "÷"; x: Num; y: Num; value: Rational };

/** A 5~6학년 operand as written: a natural number, a decimal, a proper fraction or a mixed number. */
type Num =
  | { kind: "nat"; v: Rational; n: number }
  | { kind: "dec"; v: Rational; dec: Dec }
  | { kind: "frac"; v: Rational; w: number; a: number; b: number };

const NUM = String.raw`(\d+ \d+/\d+|\d+/\d+|\d+\.\d+|\d+)`;

function num(text: string): Num {
  let m = /^(?:(\d+) )?(\d+)\/(\d+)$/.exec(text);
  if (m) {
    const [w, a, b] = [Number(m[1] ?? 0), +m[2]!, +m[3]!];
    return { kind: "frac", v: mixed(w, a, b), w, a, b };
  }
  m = /^(\d+)\.(\d+)$/.exec(text);
  if (m) return { kind: "dec", v: fromDecimal(text), dec: { int: Number(m[1]! + m[2]!), places: m[2]!.length } };
  return { kind: "nat", v: rat(Number(text)), n: Number(text) };
}

function solve(p: Problem): Solved {
  const s = plainText(p.expr);
  if (p.band === "56") {
    const m56 = new RegExp(`^${NUM} ([+−×÷]) ${NUM} = □$`).exec(s);
    if (!m56) throw new Error(`unexpected expression: ${s}`);
    const op = m56[2] as "+" | "−" | "×" | "÷";
    const x = num(m56[1]!);
    const y = num(m56[3]!);
    const value = { "+": add, "−": sub, "×": mul, "÷": div }[op](x.v, y.v);
    return { kind: "56", op, x, y, value };
  }
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
const isQuotient = (v: ChoiceValue): v is { q: number; r: number } => typeof v === "object" && "q" in v;
const isRational = (v: ChoiceValue): v is Rational => typeof v === "object" && "n" in v;
/** Off by one: a number or a fraction ±1, or a quotient-remainder pair with exactly one part off by one. */
const nearOne = (a: ChoiceValue, b: ChoiceValue) => {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) === 1;
  if (isQuotient(a) && isQuotient(b)) return Math.abs(a.q - b.q) + Math.abs(a.r - b.r) === 1;
  if (isRational(a) && isRational(b)) {
    const d = sub(a, b);
    return d.d === 1 && Math.abs(d.n) === 1;
  }
  return false;
};
/** Lowest terms, worked out here: 7/3 is "2 1/3", 6/3 is "2". */
function fractionShown(v: Rational): string {
  const g = (x: number, y: number): number => (y ? g(y, x % y) : x);
  const k = g(v.n, v.d);
  const [n, d] = [v.n / k, v.d / k];
  if (d === 1) return String(n);
  const w = Math.floor(n / d);
  return w ? `${w} ${n % d}/${d}` : `${n}/${d}`;
}
/** How a value must look: 5~6학년 소수 types as decimals, other 5~6학년 types as fractions in lowest terms. */
const shown = (v: ChoiceValue, type = ""): string =>
  typeof v === "number" ? String(v) : isQuotient(v) ? `몫 ${v.q} 나머지 ${v.r}` : type.startsWith("소수") ? toDecimal(v) : fractionShown(v);
/** Every text of a problem: expression, choices and solution. */
const texts = (p: Problem): MathText[] => [p.expr, ...p.choices, p.solution.text, p.solution.result];

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
      "56-1 분수 덧셈 [6수01-08] / 분수 뺄셈 [6수01-08]",
      "56-2 분수 곱셈 [6수01-09] / 소수 곱셈 [6수01-13]",
      "56-3 분수 나눗셈 [6수01-10] [6수01-11] / 소수 나눗셈 [6수01-14] [6수01-15]",
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

  it("mixes the two types of a level about half and half (3~4학년 level 3, every 5~6학년 level)", () => {
    const mixedLevels = MATH_LEVELS.filter((l) => l.types.length === 2);
    expect(mixedLevels.map((l) => `${l.band}-${l.level}`)).toEqual(["34-3", "56-1", "56-2", "56-3"]);
    for (const l of mixedLevels) {
      let first = 0;
      for (let seed = 0; seed < SEEDS; seed++) if (generateProblem(l.band, l.level, seed).type === l.types[0]!.name) first++;
      expect(first / SEEDS, `${l.band}-${l.level}`).toBeGreaterThan(0.45);
      expect(first / SEEDS, `${l.band}-${l.level}`).toBeLessThan(0.55);
    }
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
      p.choices.forEach((c, i) => expect(plainText(c), p.key).toBe(shown(p.values[i]!, p.type)));
    }
  });

  it("keeps wrong choices sensible: no negatives or 0, at most one ±1, remainders under the divisor (D29)", () => {
    for (const p of problems(band, level, type)) {
      const s = solve(p);
      const wrongs = p.values.filter((_, i) => i !== p.answer);
      expect(wrongs.filter((w) => nearOne(w, s.value)).length, p.key).toBeLessThanOrEqual(1);
      for (const w of wrongs) {
        if (typeof w === "number") {
          expect(Number.isInteger(w) && w >= 0, p.key).toBe(true);
          if ((s.value as number) >= 2) expect(w, p.key).not.toBe(0);
        } else if (isRational(w)) {
          expect(s.kind).toBe("56");
          expect(w.n, p.key).toBeGreaterThan(0);
          expect(w.d, p.key).toBeGreaterThan(0);
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
      for (const t of texts(p).map(plainText)) {
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

type Solved56 = Extract<Solved, { kind: "56" }>;
const OP_OF_TYPE: Record<string, Solved56["op"]> = { 덧셈: "+", 뺄셈: "−", 곱셈: "×", 나눗셈: "÷" };
const fractionToks = (t: MathText) => t.filter((x): x is { fr: [number, number]; w?: number } => typeof x === "object" && "fr" in x);
const coprime = (a: number, b: number): boolean => (b ? coprime(b, a % b) : a === 1);
const operand = (x: Num): Operand => (x.kind === "frac" ? { w: x.w, a: x.a, b: x.b } : { w: 0, a: 0, b: 1 });
/** Digits and points of two decimal operands: at most 7 keeps the expression on one line on wide screens. */
const m56Chars = (x: Num, y: Num) => toDecimal(x.v).length + toDecimal(y.v).length;
const dec = (x: Num): Dec => (x.kind === "dec" ? x.dec : { int: (x as { n: number }).n, places: 0 });

/** The slips the wrong answers must come from, for the expression as parsed here. */
function slipsFor(p: Problem, s: Solved56): Rational[] {
  const { x, y } = s;
  if (p.type === "분수 덧셈") return additionSlips(operand(x), operand(y));
  if (p.type === "분수 뺄셈") return subtractionSlips(operand(x), operand(y));
  if (p.type === "소수 곱셈") return decimalProductSlips(dec(x), dec(y));
  if (p.type === "소수 나눗셈") return decimalQuotientSlips({ x: dec(x), y: dec(y) });
  if (p.type === "분수 곱셈") {
    const f = operand(x);
    const product: FractionProduct =
      y.kind === "nat"
        ? f.w > 0
          ? { kind: "mixed×natural", w: f.w, a: f.a, b: f.b, k: y.n }
          : { kind: "proper×natural", a: f.a, b: f.b, k: y.n }
        : { kind: "proper×proper", a: f.a, b: f.b, c: operand(y).a, d: operand(y).b };
    return fractionProductSlips(product);
  }
  const q: FractionQuotient =
    x.kind === "nat" && y.kind === "nat"
      ? { kind: "natural÷natural", m: x.n, k: y.n }
      : x.kind === "nat"
        ? { kind: "natural÷fraction", k: x.n, c: operand(y).a, d: operand(y).b }
        : y.kind === "nat"
          ? { kind: "fraction÷natural", ...operand(x), k: y.n }
          : { kind: "fraction÷fraction", a: operand(x).a, b: operand(x).b, c: operand(y).a, d: operand(y).b };
  return fractionQuotientSlips(q);
}

describe("5~6학년 (D28, D29, D30, D31)", () => {
  const groups56 = GROUPS.filter(([band]) => band === "56");
  const each56 = (fn: (p: Problem, s: Solved56) => void) => {
    for (const [, level, type] of groups56) for (const p of problems("56", level, type)) fn(p, solve(p) as Solved56);
  };

  it("asks only fraction and decimal calculation of its type: no whole-number-only problems, no remainders (D28)", () => {
    each56((p, s) => {
      expect(s.op, p.key).toBe(OP_OF_TYPE[p.type.split(" ")[1]!]);
      expect(s.x.kind !== "nat" || s.y.kind !== "nat" || s.value.d !== 1, p.key).toBe(true);
      const kinds = [s.x.kind, s.y.kind];
      if (p.type.startsWith("분수")) expect(kinds, p.key).not.toContain("dec");
      else expect(kinds, p.key).not.toContain("frac");
      for (const t of texts(p)) expect(t.some((tok) => typeof tok === "object" && "small" in tok), p.key).toBe(false);
    });
  });

  it("writes every fraction stacked, mixed numbers with a proper fraction part, at most three decimal places (D29, D31)", () => {
    each56((p) => {
      for (const t of texts(p)) {
        for (const tok of t) if (typeof tok === "string") expect(tok, p.key).not.toMatch(/\d\/\d/);
        for (const f of fractionToks(t)) {
          expect(f.fr[0] > 0 && f.fr[1] > 0, p.key).toBe(true);
          if (f.w !== undefined) {
            expect(f.w, p.key).toBeGreaterThan(0);
            expect(f.fr[0], p.key).toBeLessThan(f.fr[1]);
          }
        }
        expect(plainText(t), p.key).not.toMatch(/\d\.\d{4}/);
      }
      for (const v of p.values as Rational[]) {
        expect(v.n / v.d, p.key).toBeLessThan(10_000);
        if (p.type.startsWith("소수")) expect(decimalPlaces(v), p.key).not.toBeNull();
        if (p.type.startsWith("소수")) expect(decimalPlaces(v)!, p.key).toBeLessThanOrEqual(3);
        else expect(v.d, p.key).toBeLessThanOrEqual(144);
      }
    });
  });

  it("checks reduced notation: fraction answers are never whole and every choice is in lowest terms (D29)", () => {
    each56((p, s) => {
      if (p.type.startsWith("분수")) expect(s.value.d, p.key).toBeGreaterThan(1);
      // The right choice is drawn exactly as the reduced answer, and no other choice has the same value.
      expect(plainText(p.choices[p.answer]), p.key).toBe(shown(s.value, p.type));
      expect(new Set(p.choices.map(plainText)).size, p.key).toBe(4);
    });
  });

  it("makes every wrong answer from a slip children make, never a number picked near the answer (D29)", () => {
    each56((p, s) => {
      const known = slipsFor(p, s).map((v) => `${v.n}/${v.d}`);
      p.values.forEach((v, i) => {
        if (i !== p.answer) expect(known, `${p.key} ${JSON.stringify(v)}`).toContain(`${(v as Rational).n}/${(v as Rational).d}`);
      });
    });
  });

  it("level 1 adds and subtracts fractions with different denominators 2~12, some of them mixed numbers (D30)", () => {
    for (const type of ["분수 덧셈", "분수 뺄셈"]) {
      let withMixed = 0;
      for (const p of problems("56", 1, type)) {
        const { x, y, value } = solve(p) as Solved56;
        expect([x.kind, y.kind], p.key).toEqual(["frac", "frac"]);
        const [fx, fy] = [operand(x), operand(y)];
        expect(fx.b, p.key).not.toBe(fy.b);
        for (const f of [fx, fy]) {
          expect(f.b >= 2 && f.b <= 12 && f.a < f.b && coprime(f.a, f.b) && f.w <= 3, p.key).toBe(true);
        }
        expect(value.n, p.key).toBeGreaterThan(0);
        if (fx.w + fy.w > 0) withMixed++;
      }
      expect(withMixed / SEEDS).toBeGreaterThan(0.3);
      expect(withMixed / SEEDS).toBeLessThan(0.5);
    }
  });

  it("level 2 multiplies a fraction by a natural number or a fraction, a decimal by a natural number or a decimal (D30)", () => {
    const forms = new Set<string>();
    for (const p of problems("56", 2, "분수 곱셈")) {
      const { x, y } = solve(p) as Solved56;
      expect(x.kind, p.key).toBe("frac");
      if (y.kind === "nat") expect(y.n >= 2 && y.n <= 9, p.key).toBe(true);
      else expect(y.kind === "frac" && y.w === 0, p.key).toBe(true);
      forms.add(`${operand(x).w > 0 ? "mixed" : "proper"}×${y.kind}`);
    }
    expect([...forms].sort()).toEqual(["mixed×nat", "proper×frac", "proper×nat"]);
    for (const p of problems("56", 2, "소수 곱셈")) {
      const { x, y } = solve(p) as Solved56;
      expect(x.kind, p.key).toBe("dec");
      expect([1, 2], p.key).toContain(dec(x).places);
      if (y.kind === "nat") expect(y.n >= 2 && y.n <= 9, p.key).toBe(true);
      else expect([dec(x).places, dec(y).places], p.key).toEqual([1, 1]);
      expect(m56Chars(x, y), p.key).toBeLessThanOrEqual(7);
      forms.add(`dec×${y.kind}`);
    }
    expect(forms.has("dec×nat") && forms.has("dec×dec")).toBe(true);
  });

  it("level 3 divides exactly, 100%: fraction quotients and decimals that end within three places (D30)", () => {
    const forms = new Set<string>();
    for (const type of ["분수 나눗셈", "소수 나눗셈"]) {
      for (const p of problems("56", 3, type)) {
        const { x, y, value } = solve(p) as Solved56;
        forms.add(`${type} ${x.kind}÷${y.kind}`);
        expect(same(p.values[p.answer]!, value), p.key).toBe(true);
        if (type === "소수 나눗셈") {
          expect(m56Chars(x, y), p.key).toBeLessThanOrEqual(7);
          const places = decimalPlaces(value);
          expect(places !== null && places <= 3, p.key).toBe(true);
          for (const o of [x, y]) if (o.kind === "dec") expect(o.dec.places, p.key).toBeLessThanOrEqual(2);
        }
      }
    }
    expect([...forms].sort()).toEqual([
      "분수 나눗셈 frac÷frac",
      "분수 나눗셈 frac÷nat",
      "분수 나눗셈 nat÷frac",
      "분수 나눗셈 nat÷nat",
      "소수 나눗셈 dec÷dec",
      "소수 나눗셈 dec÷nat",
      "소수 나눗셈 nat÷dec",
      "소수 나눗셈 nat÷nat",
    ]);
  });
});

describe("5~6학년 slips, worked by hand", () => {
  it("adds and subtracts the way children slip", () => {
    const keys = (vs: Rational[]) => vs.map(fractionShown);
    // 2/3 + 1/4 = 11/12: 3/7 added across, 3/12 numerators unchanged, 9/12 and 5/12 one side changed.
    expect(keys(additionSlips({ w: 0, a: 2, b: 3 }, { w: 0, a: 1, b: 4 }))).toEqual(expect.arrayContaining(["3/7", "1/4", "3/4", "5/12"]));
    // 1 3/4 + 1 1/2 = 3 1/4: the carried 1 dropped or a whole part forgotten (2 1/4), added across (2 4/6 = 2 2/3).
    expect(keys(additionSlips({ w: 1, a: 3, b: 4 }, { w: 1, a: 1, b: 2 }))).toEqual(expect.arrayContaining(["2 1/4", "2 2/3"]));
    // 3 1/4 − 1 2/3 = 1 7/12: 8 − 3 instead of borrowing (2 5/12), borrowed without taking 1 off (2 7/12).
    expect(keys(subtractionSlips({ w: 3, a: 1, b: 4 }, { w: 1, a: 2, b: 3 }))).toEqual(expect.arrayContaining(["2 5/12", "2 7/12"]));
  });

  it("multiplies and divides the way children slip", () => {
    const keys = (vs: Rational[]) => vs.map(fractionShown);
    expect(keys(fractionProductSlips({ kind: "proper×natural", a: 5, b: 6, k: 4 }))).toEqual(["5/6", "5/24", "6 2/3", "1 2/3"]);
    expect(keys(fractionProductSlips({ kind: "mixed×natural", w: 1, a: 2, b: 5, k: 3 }))).toEqual(["3 2/5", "2 1/5", "1 2/5", "7/15"]);
    expect(keys(fractionQuotientSlips({ kind: "natural÷natural", m: 7, k: 3 }))).toEqual(["3/7", "2", "2 1/7"]);
    expect(keys(fractionQuotientSlips({ kind: "fraction÷fraction", a: 3, b: 4, c: 1, d: 2 }))).toEqual(
      expect.arrayContaining(["3/8", "2/3", "2 2/3"]),
    );
    const decs = (vs: Rational[]) => vs.map(toDecimal);
    expect(decs(decimalProductSlips({ int: 24, places: 1 }, { int: 13, places: 1 }))).toEqual(["31.2", "0.312", "312", "0.0312", "2.12"]);
    expect(decs(decimalQuotientSlips({ x: { int: 7, places: 0 }, y: { int: 4, places: 0 } }))).toEqual(
      expect.arrayContaining(["17.5", "0.175", "1.3"]),
    );
    expect(decs(decimalQuotientSlips({ x: { int: 618, places: 2 }, y: { int: 3, places: 0 } }))).toContain("2.6");
  });
});

describe("rational", () => {
  it("keeps fractions in lowest terms and writes finite decimals exactly", () => {
    expect(rat(6, -8)).toEqual({ n: -3, d: 4 });
    expect(add(rat(2, 3), rat(1, 4))).toEqual(rat(11, 12));
    expect(mul(fromDecimal("1.2"), fromDecimal("0.3"))).toEqual(fromDecimal("0.36"));
    expect([toDecimal(rat(9, 25)), toDecimal(rat(8)), toDecimal(rat(1, 8)), toDecimal(rat(49, 20))]).toEqual(["0.36", "8", "0.125", "2.45"]);
    expect(decimalPlaces(rat(1, 3))).toBeNull();
    expect(fractionShown(mixed(2, 1, 3))).toBe("2 1/3");
  });
});

describe("solutions", () => {
  it("end with the right answer", () => {
    for (const [band, level, type] of GROUPS) {
      for (const p of problems(band, level, type).slice(0, 2000)) {
        const v = solve(p).value;
        const result = plainText(p.solution.result);
        if (typeof v === "number") expect(result, p.key).toMatch(new RegExp(`(^|= )${v}$|^${v} ×`));
        else if (isRational(v)) expect(result === shown(v, p.type) || result.endsWith(` = ${shown(v, p.type)}`), `${p.key} ${result}`).toBe(true);
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
