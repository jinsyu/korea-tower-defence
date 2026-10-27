// 5~6학년 분수 덧셈·뺄셈 [6수01-08]: denominators 2~12 and different, proper fractions and mixed numbers.
// Every wrong answer is a slip children make (spec table); when a problem has fewer than three, the numbers are drawn
// again. Choices are always in lowest terms, so a slip that lands on the answer's value is dropped, not shown twice.
import { josa } from "../josa";
import { problemType } from "../levels";
import { finishProblem, rationalRules, selectWrongs, type Problem } from "../problem";
import type { Rng } from "../random";
import { add, lcm, mixed, rat, sub, type Rational } from "../rational";
import { BLANK, fr, fractionText, resultText, type MathText } from "../text";

export const ADD_RULES = rationalRules({ max: 10, maxDen: 60 });
const MAX_COMMON_DENOMINATOR = 40;

/** w a/b with a/b proper and in lowest terms (w may be 0). */
export type Operand = { w: number; a: number; b: number };

const value = (x: Operand) => mixed(x.w, x.a, x.b);
/** Positive fractions only; a slip whose fraction part comes out 0 or with a 0 denominator is not a slip we show. */
const part = (n: number, d: number): Rational | null => (n > 0 && d > 0 ? rat(n, d) : null);
const withWhole = (w: number, f: Rational | null) => (f === null ? null : add(rat(w), f));

/** Slips for x + y (spec: numerators and denominators added, one side not changed when finding a common denominator). */
export function additionSlips(x: Operand, y: Operand): Rational[] {
  const L = lcm(x.b, y.b);
  const W = x.w + y.w;
  const answer = add(value(x), value(y));
  const slips = [
    withWhole(W, part(x.a + y.a, x.b + y.b)), // 2/3 + 1/4 → 3/7: numerators and denominators added
    withWhole(W, part(x.a + y.a, L)), // → 3/12: common denominator, numerators not changed
    withWhole(W, part(x.a + y.a, x.b * y.b)), // → 3/12 over the product of the denominators, numerators not changed
    withWhole(W, part((x.a * L) / x.b + y.a, L)), // → 9/12: only the first numerator changed
    withWhole(W, part(x.a + (y.a * L) / y.b, L)), // → 5/12: only the second numerator changed
  ];
  const fractionSum = add(rat(x.a, x.b), rat(y.a, y.b));
  // Mixed numbers: the 1 carried from the fraction parts dropped (1 3/4 + 1 1/2 → 2 1/4), or a whole part forgotten.
  if (W > 0 && fractionSum.n >= fractionSum.d) slips.push(sub(answer, rat(1)));
  if (x.w > 0) slips.push(sub(answer, rat(x.w)));
  if (y.w > 0) slips.push(sub(answer, rat(y.w)));
  return slips.filter((s): s is Rational => s !== null);
}

/** Slips for x − y, x > y (spec table, and taking the smaller fraction part from the bigger one instead of borrowing). */
export function subtractionSlips(x: Operand, y: Operand): Rational[] {
  const L = lcm(x.b, y.b);
  const W = x.w - y.w;
  const answer = sub(value(x), value(y));
  const xa = (x.a * L) / x.b;
  const ya = (y.a * L) / y.b;
  const slips = [
    withWhole(W, part(Math.abs(x.a - y.a), Math.abs(x.b - y.b))), // 3/4 − 1/6 → 2/2: numerators and denominators subtracted
    withWhole(W, part(Math.abs(x.a - y.a), L)), // common denominator, numerators not changed
    withWhole(W, part(Math.abs(x.a - y.a), x.b * y.b)), // product of the denominators, numerators not changed
    withWhole(W, part(Math.abs(xa - y.a), L)), // only the first numerator changed
    withWhole(W, part(Math.abs(x.a - ya), L)), // only the second numerator changed
  ];
  if (xa < ya) {
    // 3 1/4 − 1 2/3 = 3 3/12 − 1 8/12: 8 − 3 taken instead of borrowing (2 5/12), or borrowed without taking 1 off (2 7/12).
    slips.push(withWhole(W, part(ya - xa, L)), add(answer, rat(1)));
  }
  // The second whole part forgotten: 3 1/2 − 1 1/3 → 3 1/6.
  if (y.w > 0) slips.push(add(answer, rat(y.w)));
  return slips.filter((s): s is Rational => s !== null);
}

function properFraction(rng: Rng, b: number): number {
  for (;;) {
    const a = rng.int(1, b - 1);
    if (lcm(a, b) === a * b) return a;
  }
}

function denominators(rng: Rng): [number, number] {
  for (;;) {
    const b = rng.int(2, 12);
    const d = rng.int(2, 12);
    if (b !== d && lcm(b, d) <= MAX_COMMON_DENOMINATOR) return [b, d];
  }
}

function solution(x: Operand, y: Operand, op: "+" | "−", answer: Rational): Problem["solution"] {
  const L = lcm(x.b, y.b);
  const top = (o: Operand) => ((o.w * o.b + o.a) * L) / o.b;
  const sum = op === "+" ? top(x) + top(y) : top(x) - top(y);
  const lead = x.w > 0 || y.w > 0 ? `가분수로 바꾸고 분모를 ${josa(L, "으로")} 같게 해요. ` : `분모를 ${josa(L, "으로")} 같게 해요. `;
  return {
    text: [lead, fr(top(x), L), ` ${op} `, fr(top(y), L), " = "],
    result: resultText(sum, L, answer),
  };
}

/** The problem, or null when x ± y has fewer than three slips to show. */
function build(rng: Rng, typeName: "분수 덧셈" | "분수 뺄셈", x: Operand, y: Operand): Problem | null {
  const op = typeName === "분수 덧셈" ? "+" : "−";
  const answer = op === "+" ? add(value(x), value(y)) : sub(value(x), value(y));
  const candidates = rng.shuffle(op === "+" ? additionSlips(x, y) : subtractionSlips(x, y));
  if (selectWrongs(answer, candidates, ADD_RULES).length < 3) return null;
  const operand = (o: Operand): MathText => fractionText(value(o));
  return finishProblem(rng, "56", 1, {
    type: problemType("56", 1, typeName),
    expr: [...operand(x), ` ${op} `, ...operand(y), " = ", BLANK],
    answer,
    candidates,
    rules: ADD_RULES,
    solution: solution(x, y, op, answer),
  });
}

/** 분모가 다른 분수의 덧셈·뺄셈: 60% proper fractions only, 40% with mixed numbers (whole parts 1~3). */
export function fractionAddSub(rng: Rng, typeName: "분수 덧셈" | "분수 뺄셈"): Problem {
  for (;;) {
    const [b, d] = denominators(rng);
    const withMixed = rng.next() < 0.4;
    let x: Operand = { w: withMixed ? rng.int(1, 3) : 0, a: properFraction(rng, b), b };
    let y: Operand = { w: withMixed ? rng.int(0, 3) : 0, a: properFraction(rng, d), b: d };
    if (typeName === "분수 뺄셈") {
      const diff = sub(value(x), value(y));
      if (diff.n === 0) continue;
      if (diff.n < 0) [x, y] = [y, x];
    }
    const p = build(rng, typeName, x, y);
    if (p) return p;
  }
}
