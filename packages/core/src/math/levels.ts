// Problem types per grade band and level (spec "학년군별 문제 유형"). The screen shows only the band and the type name.
// Standard codes: 2022 revised mathematics curriculum.
export type MathBand = "12" | "34" | "56";
export type MathLevel = 1 | 2 | 3;

export type ProblemType = { name: string; standards: readonly string[] };

export type LevelRow = {
  band: MathBand;
  level: MathLevel;
  types: readonly ProblemType[];
  /** Number ranges, as in the spec table. */
  content: string;
};

const TIMES_TABLE: ProblemType = { name: "곱셈구구", standards: ["[2수01-11]"] };

export const MATH_LEVELS: readonly LevelRow[] = [
  { band: "12", level: 1, types: [TIMES_TABLE], content: "2·5·3·4단 (a × b, b는 1~9)" },
  { band: "12", level: 2, types: [TIMES_TABLE], content: "6·7·8·9단" },
  { band: "12", level: 3, types: [TIMES_TABLE], content: "1~9단 섞기, 0과 1의 곱, □ × b = c" },
  {
    band: "34",
    level: 1,
    types: [{ name: "곱셈", standards: ["[4수01-04]"] }],
    content: "(두 자리 수)×(한 자리 수), (두 자리 수)×(두 자리 수)",
  },
  {
    band: "34",
    level: 2,
    types: [{ name: "나눗셈", standards: ["[4수01-05]", "[4수01-06]"] }],
    content: "(두 자리 수)÷(한 자리 수), 나누어떨어지는 것과 나머지 있는 것",
  },
  {
    band: "34",
    level: 3,
    types: [
      { name: "곱셈", standards: ["[4수01-04]"] },
      { name: "나눗셈", standards: ["[4수01-07]"] },
    ],
    content: "(세 자리 수)×(두 자리 수), (두·세 자리 수)÷(두 자리 수)",
  },
  {
    band: "56",
    level: 1,
    types: [
      { name: "분수 덧셈", standards: ["[6수01-08]"] },
      { name: "분수 뺄셈", standards: ["[6수01-08]"] },
    ],
    content: "분모가 다른 분수의 덧셈·뺄셈(진분수·대분수, 분모 2~12)",
  },
  {
    band: "56",
    level: 2,
    types: [
      { name: "분수 곱셈", standards: ["[6수01-09]"] },
      { name: "소수 곱셈", standards: ["[6수01-13]"] },
    ],
    content: "(분수)×(자연수·분수), (소수)×(자연수·소수)",
  },
  {
    band: "56",
    level: 3,
    types: [
      { name: "분수 나눗셈", standards: ["[6수01-10]", "[6수01-11]"] },
      { name: "소수 나눗셈", standards: ["[6수01-14]", "[6수01-15]"] },
    ],
    content: "(자연수)÷(자연수)의 몫을 분수·소수로, (분수)÷(자연수·분수), (소수)÷(자연수·소수), 나누어떨어지는 것만",
  },
];

export function problemType(band: MathBand, level: MathLevel, name: string): ProblemType {
  const t = MATH_LEVELS.find((l) => l.band === band && l.level === level)?.types.find((x) => x.name === name);
  if (!t) throw new Error(`no problem type ${name} at ${band}-${level}`);
  return t;
}
