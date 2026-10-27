// A generated problem and the shared step that turns an answer and its wrong-answer candidates into four choices.
import type { MathBand, MathLevel, ProblemType } from "./levels";
import type { Rng } from "./random";
import { decimalPlaces, sub, type Rational } from "./rational";
import { fractionText, plainText, quotientText, type MathText } from "./text";

/**
 * A choice's value: a number, a quotient with its remainder, or an exact fraction (5~6학년, also for decimals).
 * Choices are marked by value; fractions are always shown in lowest terms, so equal values never look different.
 */
export type ChoiceValue = number | { q: number; r: number } | Rational;

export type Problem = {
  band: MathBand;
  level: MathLevel;
  /** Header type name, e.g. "곱셈구구". */
  type: string;
  standards: readonly string[];
  /** The expression as plain text, e.g. "4 × 7 = □"; the server keeps it to avoid repeats. */
  key: string;
  expr: MathText;
  choices: [MathText, MathText, MathText, MathText];
  values: [ChoiceValue, ChoiceValue, ChoiceValue, ChoiceValue];
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

export type Quotient = { q: number; r: number };

export const quotientRules = (divisor: number, maxQuotient: number): ChoiceRules<Quotient> => ({
  valid: (v) => v.q >= 1 && v.q <= maxQuotient && v.r >= 0 && v.r < divisor,
  near: (v, a) => Math.abs(v.q - a.q) + Math.abs(v.r - a.r) === 1,
  key: (v) => `${v.q}r${v.r}`,
});

/**
 * Fractions and decimals of a 5~6학년 type: positive, below `max`, a reduced denominator up to `maxDen`, and for
 * decimals at most three places (no fourth place). ±1 means a value exactly one away.
 */
export const rationalRules = (opts: { max: number; maxDen: number; decimal?: boolean }): ChoiceRules<Rational> => ({
  valid: (v) => {
    if (v.n <= 0 || v.n >= opts.max * v.d || v.d > opts.maxDen) return false;
    if (!opts.decimal) return true;
    const places = decimalPlaces(v);
    return places !== null && places <= 3;
  },
  near: (v, a) => {
    const diff = sub(v, a);
    return diff.d === 1 && Math.abs(diff.n) === 1;
  },
  key: (v) => `${v.n}/${v.d}`,
});

type Draft<V> = {
  type: ProblemType;
  expr: MathText;
  answer: V;
  candidates: Iterable<V>;
  rules: ChoiceRules<V>;
  solution: { text: MathText; result: MathText };
  /** How a choice is drawn; fractions by default. Decimal problems pass `decimalText`. */
  show?: (v: V) => MathText;
};

const valueText = (v: ChoiceValue): MathText =>
  typeof v === "number" ? [String(v)] : "q" in v ? quotientText(v.q, v.r) : fractionText(v);

export function finishProblem<V extends ChoiceValue>(rng: Rng, band: MathBand, level: MathLevel, d: Draft<V>): Problem {
  const { values, answer } = pickChoices(rng, d.answer, d.candidates, d.rules);
  return {
    band,
    level,
    type: d.type.name,
    standards: d.type.standards,
    key: plainText(d.expr),
    expr: d.expr,
    choices: values.map(d.show ?? valueText) as Problem["choices"],
    values,
    answer,
    solution: d.solution,
  };
}
