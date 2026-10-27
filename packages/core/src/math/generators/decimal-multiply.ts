// 5~6학년 소수 곱셈 [6수01-13]: (소수 한·두 자리)×(자연수), (소수 한 자리)×(소수 한 자리), so the answer has at most
// two places. (Two places × one place would leave a three-place answer whose ÷10 and ÷100 slips have a fourth place,
// too few slips to fill the choices.)
// Wrong answers (spec): the decimal point one or two places off, and the whole and decimal parts multiplied apart.
import { problemType } from "../levels";
import { finishProblem, rationalRules, selectWrongs, type Problem } from "../problem";
import type { Rng } from "../random";
import { fromDecimal, mul, rat, toDecimal, type Rational } from "../rational";
import { BLANK, decimalText } from "../text";

export const DECIMAL_RULES = rationalRules({ max: 10_000, maxDen: 1000, decimal: true });

/** A decimal written with `places` places: 2.45 is { int: 245, places: 2 }. A natural number has 0 places. */
export type Dec = { int: number; places: number };

export const decValue = (x: Dec): Rational => rat(x.int, 10 ** x.places);
export const decText = (x: Dec): string => toDecimal(decValue(x));

/**
 * Digits and points of the two numbers together, at most: "12.5 ÷ 2.5 = ?" stays on one line at the 48px+ expression
 * size of 1024px and wider screens, "7.35 ÷ 0.05 = ?" does not (measured on the problem panel).
 */
export const MAX_OPERAND_CHARS = 7;
export const fitsOneLine = (x: Dec, y: Dec): boolean => decText(x).length + decText(y).length <= MAX_OPERAND_CHARS;

/** The decimal point one or two places off: × 10, ÷ 10, × 100, ÷ 100. */
export const pointSlips = (answer: Rational): Rational[] => [10, 100].flatMap((f) => [mul(answer, rat(f)), mul(answer, rat(1, f))]);

/** Slips for x × y (y may be a natural number). */
export function decimalProductSlips(x: Dec, y: Dec): Rational[] {
  const answer = mul(decValue(x), decValue(y));
  const slips = pointSlips(answer);
  // Whole and decimal parts multiplied apart and written side by side: 2.4 × 1.3 → 2 × 1 . 4 × 3 = 2.12, 2.4 × 3 → 6.12
  // (without a carry, 2.3 × 3 → 6.9 is the answer itself and is dropped).
  if (x.places === 1 && y.places <= 1 && x.int >= 10) {
    const [xw, xf] = [Math.floor(x.int / 10), x.int % 10];
    const [yw, yf] = y.places === 1 ? [Math.floor(y.int / 10), y.int % 10] : [y.int, y.int];
    if (yw >= 1 && xf > 0 && yf > 0) slips.push(fromDecimal(`${xw * yw}.${xf * yf}`));
  }
  return slips;
}

function decimal(rng: Rng, places: 1 | 2, max: number): Dec {
  for (;;) {
    const int = rng.int(1, max * 10 ** places - 1);
    if (int % 10 !== 0) return { int, places };
  }
}

function draw(rng: Rng): [Dec, Dec] {
  const kind = rng.next();
  if (kind < 0.4) return [decimal(rng, rng.next() < 0.5 ? 1 : 2, 10), { int: rng.int(2, 9), places: 0 }];
  return [decimal(rng, 1, 10), decimal(rng, 1, 10)];
}

export function decimalMultiply(rng: Rng): Problem {
  for (;;) {
    const [x, y] = draw(rng);
    if (!fitsOneLine(x, y)) continue;
    const product = x.int * y.int;
    // A product ending in 0 would drop a place (0.5 × 4 = 2.0); those are left out so the counted places show.
    if (product % 10 === 0) continue;
    const answer = mul(decValue(x), decValue(y));
    const candidates = rng.shuffle(decimalProductSlips(x, y));
    if (selectWrongs(answer, candidates, DECIMAL_RULES).length < 3) continue;
    const places = x.places + y.places;
    const count = y.places === 0 ? `${places}자리` : `${x.places} + ${y.places} = ${places}자리`;
    return finishProblem(rng, "56", 2, {
      type: problemType("56", 2, "소수 곱셈"),
      expr: [`${decText(x)} × ${decText(y)} = `, BLANK],
      answer,
      candidates,
      rules: DECIMAL_RULES,
      solution: {
        text: [`${x.int} × ${y.int} = ${product}, 곱의 소수점 아래는 ${count}예요. `],
        result: [`${decText(x)} × ${decText(y)} = ${toDecimal(answer)}`],
      },
      show: decimalText,
    });
  }
}
