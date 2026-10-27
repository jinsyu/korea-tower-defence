// 3~4학년 나눗셈 [4수01-05] [4수01-06] [4수01-07]. Every answer reads "몫 q, 나머지 r" (remainder 0 when it divides),
// so the form of the choices never tells whether it divides. Wrong answers (spec table): quotient ±1 with the same
// remainder, a wrong remainder; never a remainder as big as the divisor.
import { josa } from "../josa";
import { problemType, type MathLevel } from "../levels";
import { finishProblem, quotientRules, type Problem, type Quotient } from "../problem";
import type { Rng } from "../random";
import { BLANK } from "../text";

const MAX_QUOTIENT = 99;

function candidates(rng: Rng, dividend: number, divisor: number, { q, r }: Quotient): Quotient[] {
  // A two-digit quotient with a digit in the wrong place, only where the quotient has two digits.
  const placeSlip = q >= 10 && divisor >= 10 ? [{ q: q + 10 * rng.pick([1, -1]), r }] : [];
  const off = rng.pick([1, -1]);
  const remainders = rng.shuffle(Array.from({ length: divisor }, (_, i) => i));
  return [
    { q: q + off, r },
    { q: q - off, r },
    // remainder counted up to the next multiple (38 ÷ 5: 40 − 38 = 2), or read off the ones digit
    { q, r: divisor - r },
    { q, r: dividend % 10 },
    ...placeSlip,
    { q: q + 2 * off, r },
    { q: q - 2 * off, r },
    ...[off, -off, 2 * off, -2 * off, 0].flatMap((dq) => remainders.map((rr) => ({ q: q + dq, r: rr }))),
  ];
}

function division(rng: Rng, level: MathLevel, typeName: string, dividend: number, divisor: number): Problem {
  const q = Math.floor(dividend / divisor);
  const r = dividend % divisor;
  const product = divisor * q;
  const solution: Problem["solution"] =
    r === 0
      ? { text: [`${divisor} × ${q} = ${dividend}, 나머지가 없어요. `], result: [`몫 ${q}, 나머지 0`] }
      : {
          text: [`${divisor} × ${q} = ${product}, ${dividend} − ${product} = ${josa(r, "이에요")}. 나머지는 ${divisor}보다 작아요. `],
          result: [`몫 ${q}, 나머지 ${r}`],
        };
  return finishProblem(rng, "34", level, {
    type: problemType("34", level, typeName),
    expr: [`${dividend} ÷ ${divisor} = `, BLANK],
    answer: { q, r },
    candidates: candidates(rng, dividend, divisor, { q, r }),
    rules: quotientRules(divisor, MAX_QUOTIENT),
    solution,
  });
}

/** divisor × q + r with the dividend inside [lo, hi], q at least 2; half of them divide exactly. */
function dividendFor(rng: Rng, divisor: number, lo: number, hi: number): number | null {
  const r = rng.next() < 0.5 ? 0 : rng.int(1, divisor - 1);
  const qMin = Math.max(2, Math.ceil((lo - r) / divisor));
  const qMax = Math.floor((hi - r) / divisor);
  return qMin > qMax ? null : divisor * rng.int(qMin, qMax) + r;
}

function twoDigitDivisor(rng: Rng, max: number): number {
  for (;;) {
    const d = rng.int(11, max);
    if (d % 10 !== 0) return d;
  }
}

/** Level 2: (two-digit) ÷ (one-digit). Level 3: (two- or three-digit) ÷ (two-digit). */
export function divide(rng: Rng, level: 2 | 3): Problem {
  for (;;) {
    let divisor: number;
    let dividend: number | null;
    if (level === 2) {
      divisor = rng.int(2, 9);
      dividend = dividendFor(rng, divisor, 10, 99);
    } else if (rng.next() < 0.3) {
      divisor = twoDigitDivisor(rng, 49);
      dividend = dividendFor(rng, divisor, 10, 99);
    } else {
      divisor = twoDigitDivisor(rng, 99);
      dividend = dividendFor(rng, divisor, 100, 999);
    }
    if (dividend !== null) return division(rng, level, "나눗셈", dividend, divisor);
  }
}
