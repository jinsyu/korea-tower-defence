// 5~6학년 소수 나눗셈 [6수01-14] [6수01-15]: (자연수)÷(자연수)의 몫을 소수로, (소수)÷(자연수), (소수)÷(소수),
// (자연수)÷(소수). Only problems that divide exactly, with at most three places. Wrong answers (spec): the decimal point
// in the wrong place; the quotient and remainder written as a decimal (7 ÷ 4 → 1.3); a 0 inside the quotient dropped.
import { problemType } from "../levels";
import { finishProblem, selectWrongs, type Problem } from "../problem";
import type { Rng } from "../random";
import { decimalPlaces, div, fromDecimal, mul, rat, toDecimal, type Rational } from "../rational";
import { BLANK, decimalText } from "../text";
import { DECIMAL_RULES, decText, decValue, fitsOneLine, pointSlips, type Dec } from "./decimal-multiply";

/** x ÷ y as written; the kind follows from which of them have places. */
export type DecimalQuotient = { x: Dec; y: Dec };

export function decimalQuotientSlips({ x, y }: DecimalQuotient): Rational[] {
  const answer = div(decValue(x), decValue(y));
  const slips = pointSlips(answer);
  if (x.places === 0 && y.places === 0) {
    // 7 ÷ 4 = 1 나머지 3 written 1.3; the numbers swapped (4 ÷ 7) where that ends.
    slips.push(fromDecimal(`${Math.floor(x.int / y.int)}.${x.int % y.int}`));
    const swapped = rat(y.int, x.int);
    if (decimalPlaces(swapped) !== null) slips.push(swapped);
  }
  // 6.18 ÷ 3 = 2.06 written 2.6: the 0 inside the quotient dropped.
  // 31.5 ÷ 3 = 10.5 written 1.5 likewise. Only a 0 with a digit before it that is not 0 and a digit after it.
  const text = toDecimal(answer);
  const at = [...text].findIndex((c, i) => c === "0" && /[1-9]/.test(text.slice(0, i)) && /\d/.test(text.slice(i + 1)));
  if (at >= 0) slips.push(fromDecimal(text.slice(0, at) + text.slice(at + 1)));
  return slips;
}

const places = (v: Rational) => decimalPlaces(v)!;

function decimal(rng: Rng, p: 1 | 2, max: number): Dec {
  for (;;) {
    const int = rng.int(1, max * 10 ** p - 1);
    if (int % 10 !== 0) return { int, places: p };
  }
}

/** A dividend x with x ÷ y = q, or null when x would have more than two places or lose its places to trailing zeros. */
function dividendFor(q: Rational, y: Dec): Dec | null {
  const x = mul(q, decValue(y));
  const p = places(x);
  if (p > 2) return null;
  return { int: x.n * (10 ** p / x.d), places: p };
}

function draw(rng: Rng): DecimalQuotient | null {
  const kind = rng.next();
  if (kind < 0.2) {
    // 3 ÷ 4 = 0.75: divisors whose quotients end.
    const k = rng.pick([2, 4, 5, 8]);
    const m = rng.int(1, 30);
    return m % k === 0 ? null : { x: { int: m, places: 0 }, y: { int: k, places: 0 } };
  }
  if (kind < 0.5) {
    // 7.35 ÷ 3 = 2.45: the dividend keeps as many places as the quotient, so the point lines up.
    const k = rng.int(2, 9);
    const q = decimal(rng, rng.next() < 0.5 ? 1 : 2, 10);
    const x = dividendFor(decValue(q), { int: k, places: 0 });
    return x && x.places === q.places ? { x, y: { int: k, places: 0 } } : null;
  }
  // (소수)÷(소수) and (자연수)÷(소수): 4.8 ÷ 0.6 = 8, 1.44 ÷ 1.2 = 1.2, 6 ÷ 0.4 = 15.
  const y = rng.next() < 0.7 ? decimal(rng, 1, 10) : decimal(rng, 2, 3);
  const q = rng.next() < 0.5 ? { int: rng.int(2, 20), places: 0 } : decimal(rng, 1, 10);
  const x = dividendFor(decValue(q), y);
  return x ? { x, y } : null;
}

function solution({ x, y }: DecimalQuotient, answer: Rational): Problem["solution"] {
  const result = [`${decText(x)} ÷ ${decText(y)} = ${toDecimal(answer)}`];
  if (y.places === 0 && x.places === 0) return { text: ["나머지가 0이 될 때까지 0을 내려 계산해요. "], result };
  if (y.places === 0) {
    const q = x.int / y.int;
    return { text: [`${x.int} ÷ ${y.int} = ${q}, 나누어지는 수의 소수점 위치에 맞춰 몫에 소수점을 찍어요. `], result };
  }
  const f = 10 ** y.places;
  const x2 = toDecimal(mul(decValue(x), rat(f)));
  return {
    text: [`나누는 수가 자연수가 되게 두 수에 똑같이 ${f}을 곱해요. `],
    result: [`${x2} ÷ ${y.int} = ${toDecimal(answer)}`],
  };
}

export function decimalDivide(rng: Rng): Problem {
  for (;;) {
    const p = draw(rng);
    if (!p || !fitsOneLine(p.x, p.y)) continue;
    const answer = div(decValue(p.x), decValue(p.y));
    if (places(answer) > 3) continue;
    const candidates = rng.shuffle(decimalQuotientSlips(p));
    if (selectWrongs(answer, candidates, DECIMAL_RULES).length < 3) continue;
    return finishProblem(rng, "56", 3, {
      type: problemType("56", 3, "소수 나눗셈"),
      expr: [`${decText(p.x)} ÷ ${decText(p.y)} = `, BLANK],
      answer,
      candidates,
      rules: DECIMAL_RULES,
      solution: solution(p, answer),
      show: decimalText,
    });
  }
}
