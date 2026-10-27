// 5~6학년 분수 곱셈 [6수01-09]: (진분수)×(자연수), (대분수)×(자연수), (진분수)×(진분수).
// Wrong answers are slips children make (spec: the natural number multiplied into the denominator too); a problem
// with fewer than three is drawn again. Answers are never whole numbers, so the form of a choice gives nothing away.
import { problemType } from "../levels";
import { finishProblem, rationalRules, selectWrongs, type Problem } from "../problem";
import type { Rng } from "../random";
import { add, gcd, isInteger, lcm, mixed, mul, rat, type Rational } from "../rational";
import { BLANK, fr, fractionText, resultText, type MathText } from "../text";

export const FRACTION_MUL_RULES = rationalRules({ max: 30, maxDen: 144 });

export type FractionProduct =
  | { kind: "proper×natural"; a: number; b: number; k: number }
  | { kind: "mixed×natural"; w: number; a: number; b: number; k: number }
  | { kind: "proper×proper"; a: number; b: number; c: number; d: number };

export function productValue(p: FractionProduct): Rational {
  if (p.kind === "proper×proper") return rat(p.a * p.c, p.b * p.d);
  const w = p.kind === "mixed×natural" ? p.w : 0;
  return mul(mixed(w, p.a, p.b), rat(p.k));
}

export function fractionProductSlips(p: FractionProduct): Rational[] {
  if (p.kind === "proper×natural") {
    const { a, b, k } = p;
    const g = gcd(k, b);
    const slips = [
      rat(a * k, b * k), // the natural number multiplied into the denominator too: 2/5 × 3 → 6/15
      rat(a, b * k), // multiplied into the denominator only: 2/5 × 3 → 2/15
    ];
    // 5/6 × 4: 6 and 4 divided by 2, then one of them used undivided: 5 × 4 / 3 or 5 × 2 / 6.
    if (g > 1) slips.push(rat(a * k, b / g), rat(a * (k / g), b));
    return slips;
  }
  if (p.kind === "mixed×natural") {
    const { w, a, b, k } = p;
    return [
      mixed(w * k, a, b), // only the whole part multiplied: 1 2/5 × 3 → 3 2/5
      add(rat(w), rat(a * k, b)), // only the fraction part multiplied: → 1 6/5
      mixed(w, a, b), // the denominator multiplied too: 7/5 × 3 → 21/15
      rat(w * b + a, b * k), // multiplied into the denominator only: → 7/15
    ];
  }
  const { a, b, c, d } = p;
  const L = lcm(b, d);
  const slips = [rat((a * L) / b * ((c * L) / d), L)]; // common denominator first, then numerators multiplied over it
  if (b === d) slips.push(rat(a * c, b)); // same denominators kept as in addition: 2/5 × 3/5 → 6/5
  // Cancelling across: only one of the two numbers divided by their common factor.
  const g1 = gcd(a, d);
  if (g1 > 1) slips.push(rat((a / g1) * c, b * d), rat(a * c, b * (d / g1)));
  const g2 = gcd(c, b);
  if (g2 > 1) slips.push(rat(a * (c / g2), b * d), rat(a * c, (b / g2) * d));
  return slips;
}

function solution(p: FractionProduct, answer: Rational): Problem["solution"] {
  if (p.kind === "proper×natural") {
    return { text: ["분자와 자연수를 곱해요. ", fr(p.a, p.b), ` × ${p.k} = `], result: resultText(p.a * p.k, p.b, answer) };
  }
  if (p.kind === "mixed×natural") {
    const top = p.w * p.b + p.a;
    return { text: ["대분수를 가분수로 바꿔 곱해요. ", fr(top, p.b), ` × ${p.k} = `], result: resultText(top * p.k, p.b, answer) };
  }
  return {
    text: ["분자끼리, 분모끼리 곱해요. ", fr(p.a, p.b), " × ", fr(p.c, p.d), " = "],
    result: resultText(p.a * p.c, p.b * p.d, answer),
  };
}

function expression(p: FractionProduct): MathText {
  if (p.kind === "proper×proper") return [fr(p.a, p.b), " × ", fr(p.c, p.d), " = ", BLANK];
  const left = p.kind === "mixed×natural" ? fractionText(mixed(p.w, p.a, p.b)) : [fr(p.a, p.b)];
  return [...left, ` × ${p.k} = `, BLANK];
}

function properFraction(rng: Rng, b: number): number {
  for (;;) {
    const a = rng.int(1, b - 1);
    if (gcd(a, b) === 1) return a;
  }
}

function draw(rng: Rng): FractionProduct {
  const kind = rng.next();
  if (kind < 0.35) {
    const b = rng.int(2, 12);
    return { kind: "proper×natural", a: properFraction(rng, b), b, k: rng.int(2, 9) };
  }
  if (kind < 0.65) {
    const b = rng.int(2, 9);
    return { kind: "mixed×natural", w: rng.int(1, 3), a: properFraction(rng, b), b, k: rng.int(2, 6) };
  }
  const b = rng.int(2, 10);
  const d = rng.next() < 0.2 ? b : rng.int(2, 10);
  return { kind: "proper×proper", a: properFraction(rng, b), b, c: properFraction(rng, d), d };
}

export function fractionMultiply(rng: Rng): Problem {
  for (;;) {
    const p = draw(rng);
    const answer = productValue(p);
    if (isInteger(answer)) continue;
    const candidates = rng.shuffle(fractionProductSlips(p));
    if (selectWrongs(answer, candidates, FRACTION_MUL_RULES).length < 3) continue;
    return finishProblem(rng, "56", 2, {
      type: problemType("56", 2, "분수 곱셈"),
      expr: expression(p),
      answer,
      candidates,
      rules: FRACTION_MUL_RULES,
      solution: solution(p, answer),
    });
  }
}
