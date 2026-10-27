// 5~6학년 분수 나눗셈 [6수01-10] [6수01-11]: (자연수)÷(자연수)의 몫을 분수로, (분수)÷(자연수), (분수)÷(분수),
// (자연수)÷(분수). Fractions always divide exactly. Wrong answers (spec): the divisor not turned over, numerator and
// denominator swapped; for (자연수)÷(자연수) the remainder dropped or put over the dividend. Never a whole-number answer.
import { problemType } from "../levels";
import { finishProblem, rationalRules, selectWrongs, type Problem } from "../problem";
import type { Rng } from "../random";
import { add, div, gcd, isInteger, mixed, mul, rat, type Rational } from "../rational";
import { BLANK, fr, fractionText, resultText, type MathText } from "../text";

export const FRACTION_DIV_RULES = rationalRules({ max: 100, maxDen: 144 });

export type FractionQuotient =
  | { kind: "natural÷natural"; m: number; k: number }
  | { kind: "fraction÷natural"; w: number; a: number; b: number; k: number }
  | { kind: "fraction÷fraction"; a: number; b: number; c: number; d: number }
  | { kind: "natural÷fraction"; k: number; c: number; d: number };

function operands(p: FractionQuotient): [Rational, Rational] {
  switch (p.kind) {
    case "natural÷natural":
      return [rat(p.m), rat(p.k)];
    case "fraction÷natural":
      return [mixed(p.w, p.a, p.b), rat(p.k)];
    case "fraction÷fraction":
      return [rat(p.a, p.b), rat(p.c, p.d)];
    case "natural÷fraction":
      return [rat(p.k), rat(p.c, p.d)];
  }
}

export const quotientValue = (p: FractionQuotient): Rational => div(...operands(p));

const flip = (x: Rational) => rat(x.d, x.n);

export function fractionQuotientSlips(p: FractionQuotient): Rational[] {
  const [x, y] = operands(p);
  const answer = div(x, y);
  if (p.kind === "natural÷natural") {
    const q = Math.floor(p.m / p.k);
    return [
      flip(answer), // 7 ÷ 3 written 3/7: numerator and denominator swapped
      rat(q), // only the quotient kept: 7 ÷ 3 → 2
      mixed(q, p.m % p.k, p.m), // the remainder put over the dividend: 7 ÷ 3 → 2 1/7
    ];
  }
  const slips = [
    mul(x, y), // the divisor not turned over (multiplied as it is)
    flip(answer), // numerator and denominator of the answer swapped
    mul(flip(x), flip(y)), // both numbers turned over
    mul(flip(x), y), // the dividend turned over instead of the divisor
  ];
  // 2 1/3 ÷ 2: only the whole part or only the fraction part divided (the whole part left out of the division).
  if (p.kind === "fraction÷natural" && p.w > 0) slips.push(add(rat(p.w, p.k), rat(p.a, p.b)), add(rat(p.w), rat(p.a, p.b * p.k)));
  return slips;
}

function solution(p: FractionQuotient, answer: Rational): Problem["solution"] {
  const turn = "나누는 수를 뒤집어 곱해요. ";
  switch (p.kind) {
    case "natural÷natural":
      return { text: ["나누어지는 수를 분자, 나누는 수를 분모로 써요. "], result: [`${p.m} ÷ ${p.k} = `, ...resultText(p.m, p.k, answer)] };
    case "fraction÷natural": {
      const top = p.w * p.b + p.a;
      const lead = p.w > 0 ? "대분수를 가분수로 바꾸고 나누는 수를 뒤집어 곱해요. " : turn;
      return { text: [lead, fr(top, p.b), " × ", fr(1, p.k), " = "], result: resultText(top, p.b * p.k, answer) };
    }
    case "fraction÷fraction":
      return { text: [turn, fr(p.a, p.b), " × ", fr(p.d, p.c), " = "], result: resultText(p.a * p.d, p.b * p.c, answer) };
    case "natural÷fraction":
      return { text: [turn, `${p.k} × `, fr(p.d, p.c), " = "], result: resultText(p.k * p.d, p.c, answer) };
  }
}

function expression(p: FractionQuotient): MathText {
  switch (p.kind) {
    case "natural÷natural":
      return [`${p.m} ÷ ${p.k} = `, BLANK];
    case "fraction÷natural":
      return [...fractionText(mixed(p.w, p.a, p.b)), ` ÷ ${p.k} = `, BLANK];
    case "fraction÷fraction":
      return [fr(p.a, p.b), " ÷ ", fr(p.c, p.d), " = ", BLANK];
    case "natural÷fraction":
      return [`${p.k} ÷ `, fr(p.c, p.d), " = ", BLANK];
  }
}

function properFraction(rng: Rng, b: number): number {
  for (;;) {
    const a = rng.int(1, b - 1);
    if (gcd(a, b) === 1) return a;
  }
}

function draw(rng: Rng): FractionQuotient {
  const kind = rng.next();
  if (kind < 0.2) return { kind: "natural÷natural", m: rng.int(3, 30), k: rng.int(2, 9) };
  if (kind < 0.45) {
    const b = rng.int(2, 9);
    return { kind: "fraction÷natural", w: rng.next() < 0.3 ? rng.int(1, 3) : 0, a: properFraction(rng, b), b, k: rng.int(2, 9) };
  }
  if (kind < 0.8) {
    const b = rng.int(2, 10);
    const d = rng.int(2, 10);
    return { kind: "fraction÷fraction", a: properFraction(rng, b), b, c: properFraction(rng, d), d };
  }
  const d = rng.int(3, 10);
  return { kind: "natural÷fraction", k: rng.int(2, 9), c: properFraction(rng, d), d };
}

export function fractionDivide(rng: Rng): Problem {
  for (;;) {
    const p = draw(rng);
    // (자연수)÷(자연수): the dividend bigger so the quotient has a whole part and a remainder to slip on.
    if (p.kind === "natural÷natural" && p.m <= p.k) continue;
    const answer = quotientValue(p);
    if (isInteger(answer)) continue;
    const candidates = rng.shuffle(fractionQuotientSlips(p));
    if (selectWrongs(answer, candidates, FRACTION_DIV_RULES).length < 3) continue;
    return finishProblem(rng, "56", 3, {
      type: problemType("56", 3, "분수 나눗셈"),
      expr: expression(p),
      answer,
      candidates,
      rules: FRACTION_DIV_RULES,
      solution: solution(p, answer),
    });
  }
}
