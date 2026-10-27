// 곱셈구구 [2수01-11]: a × b = □ only, a from the level's tables (2~9), b 1~9 (spec 4판: no blank factor, no 0 or 1 table).
// Wrong answers (spec table): a×(b±1), (a±1)×b, a+b.
import { josa } from "../josa";
import { MATH_LEVELS, TIMES_TABLE, type MathLevel } from "../levels";
import { finishProblem, numberRules, type Problem } from "../problem";
import type { Rng } from "../random";
import { BLANK } from "../text";

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
  if (b === 1) {
    mistakes = [answer + 1, 1, answer * 2];
    solution = { text: ["어떤 수에 1을 곱하면 그 수 그대로예요. "], result: [`${a} × ${b} = ${answer}`] };
  } else {
    const steps = [
      isDigit(b + 1) ? a * (b + 1) : null,
      a * (b - 1),
      isDigit(a + 1) ? (a + 1) * b : null,
      (a - 1) * b,
      a + b,
    ].filter((v): v is number => v !== null);
    mistakes = rng.shuffle(steps);
    const before = a * (b - 1);
    solution = {
      text: [`${josa(`${a} × ${b}`, "은")} ${a} × ${b - 1} = ${before}에 ${josa(a, "을")} 한 번 더 더한 수예요. `],
      result: [`${before} + ${a} = ${answer}`],
    };
  }
  return finishProblem(rng, level, {
    type: TIMES_TABLE,
    expr: [`${a} × ${b} = `, BLANK],
    answer,
    candidates: [...mistakes, ...neighbours(a, b)],
    rules: numberRules(answer, MAX),
    solution,
  });
}

export function timesTable(rng: Rng, level: MathLevel): Problem {
  const { tables } = MATH_LEVELS[level - 1]!;
  return product(rng, level, rng.pick(tables), rng.int(1, 9));
}
