import type { MathLevel } from "../levels";
import type { Problem } from "../problem";
import { createRng } from "../random";
import { divide } from "./divide";
import { multiply } from "./multiply";
import { timesTable } from "./times-table";

/**
 * The problem for a band, level and seed; the same seed always gives the same problem. 5~6학년 comes in T9-2.
 * `type` fixes the type name where a level mixes two ("곱셈" or "나눗셈" at 3~4학년 level 3); otherwise half and half.
 */
export function generateProblem(band: "12" | "34", level: MathLevel, seed: number, type?: string): Problem {
  const rng = createRng(seed);
  if (band === "12") return timesTable(rng, level);
  if (level === 1) return multiply(rng, 1);
  if (level === 2) return divide(rng, 2);
  const kind = type ?? (rng.next() < 0.5 ? "곱셈" : "나눗셈");
  return kind === "곱셈" ? multiply(rng, 3) : divide(rng, 3);
}
