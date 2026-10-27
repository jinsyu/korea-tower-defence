import type { MathBand, MathLevel } from "../levels";
import type { Problem } from "../problem";
import { createRng, type Rng } from "../random";
import { decimalDivide } from "./decimal-divide";
import { decimalMultiply } from "./decimal-multiply";
import { divide } from "./divide";
import { fractionAddSub } from "./fraction-add";
import { fractionDivide } from "./fraction-divide";
import { fractionMultiply } from "./fraction-multiply";
import { multiply } from "./multiply";
import { timesTable } from "./times-table";

/** The two type names of each 5~6학년 level. */
const TYPES_56 = {
  1: ["분수 덧셈", "분수 뺄셈"],
  2: ["분수 곱셈", "소수 곱셈"],
  3: ["분수 나눗셈", "소수 나눗셈"],
} as const;

function band56(rng: Rng, level: MathLevel, type?: string): Problem {
  const [first, second] = TYPES_56[level];
  const kind = type ?? (rng.next() < 0.5 ? first : second);
  if (kind !== first && kind !== second) throw new Error(`no problem type ${kind} at 56-${level}`);
  if (level === 1) return fractionAddSub(rng, kind as "분수 덧셈" | "분수 뺄셈");
  if (level === 2) return kind === first ? fractionMultiply(rng) : decimalMultiply(rng);
  return kind === first ? fractionDivide(rng) : decimalDivide(rng);
}

/**
 * The problem for a band, level and seed; the same seed always gives the same problem.
 * `type` fixes the type name where a level mixes two (3~4학년 level 3, every 5~6학년 level); otherwise half and half.
 */
export function generateProblem(band: MathBand, level: MathLevel, seed: number, type?: string): Problem {
  const rng = createRng(seed);
  if (band === "12") return timesTable(rng, level);
  if (band === "56") return band56(rng, level, type);
  if (level === 1) return multiply(rng, 1);
  if (level === 2) return divide(rng, 2);
  const kind = type ?? (rng.next() < 0.5 ? "곱셈" : "나눗셈");
  return kind === "곱셈" ? multiply(rng, 3) : divide(rng, 3);
}
