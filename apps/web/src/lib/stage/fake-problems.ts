// Fake 5~6학년 problems for the defence screen until their generator (T9-2) and the server (T12) take over.
// 1~2·3~4학년 problems come from the core generator (T9-1). The level is never shown on screen.
import type { MathText } from "@ktd/core";
import type { GradeBandId } from "@/lib/grade-bands";

export type { MathText, MathTok } from "@ktd/core";

export type FakeProblem = {
  band: GradeBandId;
  level: 1 | 2 | 3;
  /** Header type name, e.g. "곱셈구구" (spec table "유형(머리줄 이름)"). */
  type: string;
  expr: MathText;
  choices: [MathText, MathText, MathText, MathText];
  answer: 0 | 1 | 2 | 3;
  /** One or two lines; `result` is shown bold at the end. */
  solution: { text: MathText; result: MathText };
};

const B = { blank: true } as const;
const fr = (n: number, d: number) => ({ fr: [n, d] as [number, number] });
const n = (v: number | string): MathText => [String(v)];

export const FAKE_PROBLEMS: readonly FakeProblem[] = [
  // 5~6학년 · 분수·소수 계산
  {
    band: "56", level: 1, type: "분수 덧셈", expr: [fr(2, 3), " + ", fr(1, 4), " = ", B],
    choices: [[fr(3, 7)], [fr(11, 12)], [fr(3, 12)], [fr(9, 12)]], answer: 1,
    solution: { text: ["분모를 12로 같게 해요. ", fr(8, 12), " + ", fr(3, 12), " = "], result: [fr(11, 12)] },
  },
  {
    band: "56", level: 1, type: "분수 뺄셈", expr: [fr(3, 4), " − ", fr(1, 6), " = ", B],
    choices: [[fr(2, 10)], [fr(1, 12)], [fr(7, 12)], [fr(2, 12)]], answer: 2,
    solution: { text: ["분모를 12로 같게 해요. ", fr(9, 12), " − ", fr(2, 12), " = "], result: [fr(7, 12)] },
  },
  {
    band: "56", level: 2, type: "분수 곱셈", expr: [fr(2, 5), " × 3 = ", B],
    choices: [[fr(6, 15)], [fr(6, 5)], [fr(5, 6)], [fr(2, 15)]], answer: 1,
    solution: { text: ["분자에만 3을 곱해요. 분모는 그대로예요. "], result: [fr(6, 5)] },
  },
  {
    band: "56", level: 2, type: "소수 곱셈", expr: ["1.2 × 0.3 = ", B],
    choices: [n("3.6"), n("0.036"), n("0.36"), n("36")], answer: 2,
    solution: { text: ["12 × 3 = 36, 소수점 아래 자리는 1 + 1 = 2자리 → "], result: ["0.36"] },
  },
  {
    band: "56", level: 3, type: "분수 나눗셈", expr: [fr(3, 4), " ÷ ", fr(1, 2), " = ", B],
    choices: [[fr(3, 8)], [fr(4, 6)], [fr(2, 3)], [fr(3, 2)]], answer: 3,
    solution: { text: ["나누는 수를 뒤집어 곱해요. ", fr(3, 4), " × ", fr(2, 1), " = "], result: [fr(6, 4), " = ", fr(3, 2)] },
  },
  {
    band: "56", level: 3, type: "소수 나눗셈", expr: ["4.8 ÷ 0.6 = ", B],
    choices: [n("0.8"), n("8"), n("80"), n("2.88")], answer: 1,
    solution: { text: ["둘 다 10배 하면 48 ÷ 6이에요. "], result: ["48 ÷ 6 = 8"] },
  },
];

/** The fake problems of a band and level, in list order. */
export function fakeProblemsFor(band: GradeBandId, level: number): FakeProblem[] {
  return FAKE_PROBLEMS.filter((p) => p.band === band && p.level === level);
}

/** Spoken form for screen readers: fractions read "4분의 3", the blank reads "빈칸". */
export function spoken(text: MathText): string {
  return text
    .map((t) => {
      if (typeof t === "string") return t.replaceAll("×", " 곱하기 ").replaceAll("÷", " 나누기 ").replaceAll("−", " 빼기 ").replaceAll("+", " 더하기 ").replaceAll("=", " 는 ");
      if ("fr" in t) return ` ${t.fr[1]}분의 ${t.fr[0]} `;
      if ("small" in t) return ` ${t.small} `;
      return " 빈칸 ";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
