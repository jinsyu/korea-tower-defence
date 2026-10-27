// 1~2학년 곱셈구구 [2수01-11]. Wrong answers (spec table): a×(b±1), (a±1)×b, a+b, and 0×b counted as b.
import type { MathLevel } from "../levels";
import { josa } from "../josa";
import { finishProblem, numberRules, type Problem } from "../problem";
import type { Rng } from "../random";
import { BLANK } from "../text";
import { problemType } from "../levels";

const MAX = 99;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const isDigit = (n: number) => n >= 1 && n <= 9;

/** Other products of the same rows, nearest first: always enough to fill the choices. */
function neighbours(a: number, b: number): number[] {
  const all = DIGITS.flatMap((k) => [a * k, k * b]);
  return all.sort((x, y) => Math.abs(x - a * b) - Math.abs(y - a * b));
}

function product(rng: Rng, level: MathLevel, a: number, b: number): Problem {
  const answer = a * b;
  let mistakes: number[];
  let solution: Problem["solution"];
  if (a === 0 || b === 0) {
    const n = a + b;
    // 0 × n read as n, as 1, or with the 0 written after n.
    mistakes = [n, 1, n * 10];
    solution = {
      text: [a === 0 ? "0에 어떤 수를 곱해도 0이에요. " : "어떤 수에 0을 곱해도 0이에요. "],
      result: [`${a} × ${b} = 0`],
    };
  } else if (a === 1 || b === 1) {
    const n = a * b;
    mistakes = [n + 1, 1, n * 2];
    solution = {
      text: [a === 1 ? "1에 어떤 수를 곱하면 그 수 그대로예요. " : "어떤 수에 1을 곱하면 그 수 그대로예요. "],
      result: [`${a} × ${b} = ${answer}`],
    };
  } else {
    const steps = [
      isDigit(b + 1) ? a * (b + 1) : null,
      isDigit(b - 1) ? a * (b - 1) : null,
      isDigit(a + 1) ? (a + 1) * b : null,
      isDigit(a - 1) ? (a - 1) * b : null,
      a + b,
    ].filter((v): v is number => v !== null);
    mistakes = rng.shuffle(steps);
    const before = a * (b - 1);
    solution = {
      text: [`${josa(`${a} × ${b}`, "은")} ${a} × ${b - 1} = ${before}에 ${josa(a, "을")} 한 번 더 더한 수예요. `],
      result: [`${before} + ${a} = ${answer}`],
    };
  }
  return finishProblem(rng, "12", level, {
    type: problemType("12", level, "곱셈구구"),
    expr: [`${a} × ${b} = `, BLANK],
    answer,
    candidates: [...mistakes, ...neighbours(a, b)],
    rules: numberRules(answer, MAX),
    solution,
  });
}

/** □ × b = c: the missing factor is a digit, and so are the wrong answers. */
function missingFactor(rng: Rng, a: number, b: number): Problem {
  const c = a * b;
  const off = rng.pick([1, -1]);
  const candidates = [a + off, a - off, b, a + 2 * off, a - 2 * off, ...[...DIGITS].sort((x, y) => Math.abs(x - a) - Math.abs(y - a))];
  return finishProblem(rng, "12", 3, {
    type: problemType("12", 3, "곱셈구구"),
    expr: [BLANK, ` × ${b} = ${c}`],
    answer: a,
    candidates,
    rules: { ...numberRules(a, 9), valid: isDigit },
    solution: { text: [`${b}단 곱셈구구에서 곱이 ${josa(c, "이")} 되는 수를 찾아요. `], result: [`${a} × ${b} = ${c}`] },
  });
}

export function timesTable(rng: Rng, level: MathLevel): Problem {
  if (level === 1) return product(rng, 1, rng.pick([2, 3, 4, 5]), rng.int(1, 9));
  if (level === 2) return product(rng, 2, rng.int(6, 9), rng.int(1, 9));
  const kind = rng.next();
  if (kind < 0.45) return product(rng, 3, rng.int(2, 9), rng.int(2, 9));
  if (kind < 0.7) {
    const special = rng.pick([0, 1]);
    const n = rng.int(2, 9);
    return rng.next() < 0.5 ? product(rng, 3, special, n) : product(rng, 3, n, special);
  }
  return missingFactor(rng, rng.int(2, 9), rng.int(2, 9));
}
