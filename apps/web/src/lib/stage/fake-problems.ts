// Fake problem list for the defence screen until the math generator (T9) and the server (T12) take over.
// Problem types and wrong answers follow spec "학년군별 문제 유형"; the level is never shown on screen.
import type { GradeBandId } from "@/lib/grade-bands";

/** A piece of math text: plain text, a fraction [numerator, denominator], a small word label or the answer blank. */
export type MathTok = string | { fr: [number, number] } | { small: string } | { blank: true };
export type MathText = MathTok[];

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
const qr = (q: number, r: number): MathText => [{ small: "몫" }, String(q), { small: "나머지" }, String(r)];
const n = (v: number | string): MathText => [String(v)];

export const FAKE_PROBLEMS: readonly FakeProblem[] = [
  // 1~2학년 · 곱셈구구: 1단계 2·5·3·4단, 2단계 6~9단, 3단계 섞기와 □ × b = c
  {
    band: "12", level: 1, type: "곱셈구구", expr: ["4 × 7 = ", B],
    choices: [n(24), n(28), n(32), n(11)], answer: 1,
    solution: { text: ["4 × 7은 4 × 6 = 24에 4를 한 번 더 더한 수예요. "], result: ["24 + 4 = 28"] },
  },
  {
    band: "12", level: 1, type: "곱셈구구", expr: ["5 × 6 = ", B],
    choices: [n(30), n(25), n(11), n(35)], answer: 0,
    solution: { text: ["5 × 6은 5 × 5 = 25에 5를 한 번 더 더한 수예요. "], result: ["25 + 5 = 30"] },
  },
  {
    band: "12", level: 2, type: "곱셈구구", expr: ["7 × 8 = ", B],
    choices: [n(49), n(15), n(56), n(64)], answer: 2,
    solution: { text: ["7 × 8은 7 × 7 = 49에 7을 한 번 더 더한 수예요. "], result: ["49 + 7 = 56"] },
  },
  {
    band: "12", level: 2, type: "곱셈구구", expr: ["9 × 6 = ", B],
    choices: [n(45), n(54), n(15), n(60)], answer: 1,
    solution: { text: ["9 × 6은 9 × 5 = 45에 9를 한 번 더 더한 수예요. "], result: ["45 + 9 = 54"] },
  },
  {
    band: "12", level: 3, type: "곱셈구구", expr: [B, " × 8 = 48"],
    choices: [n(5), n(7), n(6), n(8)], answer: 2,
    solution: { text: ["8단에서 48이 되는 수를 찾아요. "], result: ["6 × 8 = 48"] },
  },
  {
    band: "12", level: 3, type: "곱셈구구", expr: ["0 × 9 = ", B],
    choices: [n(9), n(0), n(1), n(90)], answer: 1,
    solution: { text: ["0에 어떤 수를 곱해도 0이에요. "], result: ["0 × 9 = 0"] },
  },
  // 3~4학년 · 곱셈, 나눗셈
  {
    band: "34", level: 1, type: "곱셈", expr: ["34 × 26 = ", B],
    choices: [n(884), n(272), n(784), n(984)], answer: 0,
    solution: { text: ["34 × 6 = 204, 34 × 20 = 680(한 자리 밀어 써요) → "], result: ["204 + 680 = 884"] },
  },
  {
    band: "34", level: 1, type: "곱셈", expr: ["47 × 3 = ", B],
    choices: [n(121), n(141), n(131), n(151)], answer: 1,
    solution: { text: ["7 × 3 = 21에서 2를 올려요. 4 × 3 + 2 = 14 → "], result: ["141"] },
  },
  {
    band: "34", level: 2, type: "나눗셈", expr: ["38 ÷ 5 = ", B],
    choices: [qr(6, 3), qr(7, 3), qr(8, 3), qr(7, 2)], answer: 1,
    solution: { text: ["5 × 7 = 35, 38 − 35 = 3이에요. 나머지는 5보다 작아요. "], result: ["몫 7, 나머지 3"] },
  },
  {
    band: "34", level: 2, type: "나눗셈", expr: ["72 ÷ 8 = ", B],
    choices: [n(8), n(9), n(7), n(10)], answer: 1,
    solution: { text: ["8 × 9 = 72라서 나누어떨어져요. "], result: ["72 ÷ 8 = 9"] },
  },
  {
    band: "34", level: 3, type: "곱셈", expr: ["125 × 32 = ", B],
    choices: [n(4000), n(3900), n(625), n(4100)], answer: 0,
    solution: { text: ["125 × 2 = 250, 125 × 30 = 3750 → "], result: ["250 + 3750 = 4000"] },
  },
  {
    band: "34", level: 3, type: "나눗셈", expr: ["156 ÷ 12 = ", B],
    choices: [n(12), n(14), n(13), n(31)], answer: 2,
    solution: { text: ["12 × 13 = 156이에요. 몫을 어림해 12 × 10 = 120에서 시작해요. "], result: ["13"] },
  },
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
