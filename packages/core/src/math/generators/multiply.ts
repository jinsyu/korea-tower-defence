// 3~4학년 곱셈 [4수01-04]. Every wrong answer is a slip children make (spec table: carries forgotten, the second row
// not shifted one place). When a problem has fewer than three such slips (no carries at all), the numbers are drawn again.
import { josa } from "../josa";
import { problemType, type MathLevel } from "../levels";
import { finishProblem, numberRules, selectWrongs, type Problem } from "../problem";
import type { Rng } from "../random";
import { BLANK } from "../text";

const MAX = 99_999;

/** n with the given number of digits, not a multiple of 10 (so every digit of the multiplier matters). */
function numberWithDigits(rng: Rng, count: number): number {
  const lo = 10 ** (count - 1);
  for (;;) {
    const n = rng.int(lo === 1 ? 2 : lo, lo * 10 - 1);
    if (n % 10 !== 0) return n;
  }
}

const digitsOf = (n: number) => String(n).split("").map(Number).reverse();

/** a × d (d one digit) with every carry forgotten: 47 × 3 → 1 written, 2 dropped, 4 × 3 = 12 → 121. */
export function withoutCarry(a: number, d: number): number {
  const ds = digitsOf(a);
  return ds.reduce((sum, x, i) => sum + (i === ds.length - 1 ? x * d : (x * d) % 10) * 10 ** i, 0);
}

/** x + y with the carries of the addition forgotten: 216 + 2880 → 2096. */
export function addWithoutCarry(x: number, y: number): number {
  const xs = digitsOf(x);
  const ys = digitsOf(y);
  const n = Math.max(xs.length, ys.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (((xs[i] ?? 0) + (ys[i] ?? 0)) % 10) * 10 ** i;
  return sum;
}

/** Slips for (two-digit) × (one-digit), 47 × 3 = 141. */
function oneDigitSlips(a: number, d: number): number[] {
  const tens = Math.floor(a / 10);
  const ones = a % 10;
  const carry = Math.floor((ones * d) / 10);
  return [
    withoutCarry(a, d), // 121: the carry dropped
    (tens + carry) * d * 10 + ((ones * d) % 10), // 181: the carry added before multiplying the tens
    Number(`${tens * d}${ones * d}`), // 1221: the two products written side by side
    (tens + carry) * 10 + ((ones * d) % 10), // 61: the tens not multiplied, only the carry added
  ];
}

/** Slips for a × (two-digit), 34 × 26 = 884. */
function twoDigitSlips(a: number, b: number): number[] {
  const b1 = b % 10;
  const b10 = Math.floor(b / 10);
  const p1 = a * b1;
  const p2 = a * b10 * 10;
  const slips = [
    p1 + a * b10, // 272: the tens row not shifted one place
    withoutCarry(a, b1) + withoutCarry(a, b10) * 10, // carries forgotten in both rows
    withoutCarry(a, b1) + p2, // carry forgotten in the ones row
    p1 + withoutCarry(a, b10) * 10, // carry forgotten in the tens row
    addWithoutCarry(p1, p2), // carries forgotten when adding the two rows
  ];
  // 624: ones × ones and tens × tens only
  if (a < 100) slips.push(Math.floor(a / 10) * b10 * 100 + (a % 10) * b1);
  return slips;
}

function solutionByOneDigit(a: number, b: number): Problem["solution"] {
  const tens = a - (a % 10);
  const x = tens * b;
  const y = (a % 10) * b;
  return {
    text: [`${josa(`${a} × ${b}`, "은")} ${tens} × ${b} = ${josa(x, "과")} ${a % 10} × ${b} = ${josa(y, "을")} 더해요. `],
    result: [`${x} + ${y} = ${a * b}`],
  };
}

function solutionByTwoDigits(a: number, b: number): Problem["solution"] {
  const p1 = a * (b % 10);
  const p2 = a * (b - (b % 10));
  return {
    text: [`${a} × ${b % 10} = ${p1}, ${a} × ${b - (b % 10)} = ${p2}, 두 곱을 더해요. `],
    result: [`${p1} + ${p2} = ${a * b}`],
  };
}

/** The problem, or null when a × b has fewer than three usable slips. */
function product(rng: Rng, level: MathLevel, a: number, b: number): Problem | null {
  const answer = a * b;
  const candidates = rng.shuffle(b < 10 ? oneDigitSlips(a, b) : twoDigitSlips(a, b));
  const rules = numberRules(answer, MAX);
  if (selectWrongs(answer, candidates, rules).length < 3) return null;
  return finishProblem(rng, "34", level, {
    type: problemType("34", level, "곱셈"),
    expr: [`${a} × ${b} = `, BLANK],
    answer,
    candidates,
    rules,
    solution: b < 10 ? solutionByOneDigit(a, b) : solutionByTwoDigits(a, b),
  });
}

/** Level 1: (two-digit) × (one- or two-digit). Level 3: (three-digit) × (two-digit). */
export function multiply(rng: Rng, level: 1 | 3): Problem {
  for (;;) {
    const p =
      level === 1
        ? product(rng, 1, numberWithDigits(rng, 2), numberWithDigits(rng, rng.next() < 0.5 ? 1 : 2))
        : product(rng, 3, numberWithDigits(rng, 3), numberWithDigits(rng, 2));
    if (p) return p;
  }
}
