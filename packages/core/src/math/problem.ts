// A generated problem and the shared step that turns an answer and its wrong-answer candidates into four choices.
import type { MathLevel, ProblemType } from "./levels";
import type { Rng } from "./random";
import { plainText, type MathText } from "./text";

export type Problem = {
  level: MathLevel;
  /** Header type name, e.g. "곱셈구구". */
  type: string;
  standards: readonly string[];
  /** The expression as plain text, e.g. "4 × 7 = □"; the server keeps it to avoid repeats. */
  key: string;
  expr: MathText;
  choices: [MathText, MathText, MathText, MathText];
  values: [number, number, number, number];
  answer: 0 | 1 | 2 | 3;
  /** One or two lines; `result` is shown bold at the end. */
  solution: { text: MathText; result: MathText };
};

/** A wrong answer is kept when `valid`; at most one may be `near` (±1) the answer. */
export type ChoiceRules<V> = { valid(v: V): boolean; near(v: V, answer: V): boolean; key(v: V): string };

/** The first three usable candidates, in the given order (fewer when the candidates run out). */
export function selectWrongs<V>(answer: V, candidates: Iterable<V>, rules: ChoiceRules<V>): V[] {
  const seen = new Set([rules.key(answer)]);
  const wrongs: V[] = [];
  let nearUsed = false;
  for (const c of candidates) {
    if (wrongs.length === 3) break;
    const k = rules.key(c);
    if (seen.has(k) || !rules.valid(c)) continue;
    const near = rules.near(c, answer);
    if (near && nearUsed) continue;
    seen.add(k);
    nearUsed ||= near;
    wrongs.push(c);
  }
  return wrongs;
}

/**
 * Three wrong answers from `selectWrongs`, shuffled, with the answer at a uniformly random place,
 * so no retry can bias the answer position.
 */
export function pickChoices<V>(rng: Rng, answer: V, candidates: Iterable<V>, rules: ChoiceRules<V>): { values: [V, V, V, V]; answer: 0 | 1 | 2 | 3 } {
  const wrongs = selectWrongs(answer, candidates, rules);
  if (wrongs.length < 3) throw new Error(`not enough wrong answers for ${rules.key(answer)}`);
  const at = rng.int(0, 3) as 0 | 1 | 2 | 3;
  const values = rng.shuffle(wrongs);
  values.splice(at, 0, answer);
  return { values: values as [V, V, V, V], answer: at };
}

export const numberRules = (answer: number, max: number): ChoiceRules<number> => ({
  // 0 only when the answer itself is 0 or 1 (spec: no 0 for answers of 2 or more).
  valid: (v) => Number.isInteger(v) && v >= (answer >= 2 ? 1 : 0) && v <= max,
  near: (v, a) => Math.abs(v - a) === 1,
  key: String,
});

type Draft = {
  type: ProblemType;
  expr: MathText;
  answer: number;
  candidates: Iterable<number>;
  rules: ChoiceRules<number>;
  solution: { text: MathText; result: MathText };
};

export function finishProblem(rng: Rng, level: MathLevel, d: Draft): Problem {
  const { values, answer } = pickChoices(rng, d.answer, d.candidates, d.rules);
  return {
    level,
    type: d.type.name,
    standards: d.type.standards,
    key: plainText(d.expr),
    expr: d.expr,
    choices: values.map((v) => [String(v)]) as Problem["choices"],
    values,
    answer,
    solution: d.solution,
  };
}
