// The three grade bands asked on the first screen (spec "학년군 고르기"). Problem types move to core in T9.
export type GradeBandId = "12" | "34" | "56";

export type GradeBand = {
  id: GradeBandId;
  label: string;
  topic: string;
  /** Example expression; a fraction example is given as [numerator, denominator] pairs. */
  example: { text: string } | { fractions: [[number, number], [number, number]]; op: "+" };
  /** Spoken form of the example for screen readers. */
  exampleSpoken: string;
};

export const GRADE_BANDS: GradeBand[] = [
  { id: "12", label: "1~2학년", topic: "곱셈구구", example: { text: "7 × 8" }, exampleSpoken: "7 곱하기 8" },
  { id: "34", label: "3~4학년", topic: "두 자리 수 곱셈·나눗셈", example: { text: "34 × 26" }, exampleSpoken: "34 곱하기 26" },
  {
    id: "56",
    label: "5~6학년",
    topic: "분수·소수 계산",
    example: { fractions: [[2, 3], [1, 4]], op: "+" },
    exampleSpoken: "3분의 2 더하기 4분의 1",
  },
];

export const DEFAULT_GRADE_BAND: GradeBandId = "12";
