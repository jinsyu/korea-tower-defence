import type { MathLevel } from "../levels";
import type { Problem } from "../problem";
import { createRng } from "../random";
import { timesTable } from "./times-table";

/** The problem for a level and seed; the same seed always gives the same problem. */
export function generateProblem(level: MathLevel, seed: number): Problem {
  return timesTable(createRng(seed), level);
}
