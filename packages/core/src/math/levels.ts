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
];

export function problemType(band: MathBand, level: MathLevel, name: string): ProblemType {
  const t = MATH_LEVELS.find((l) => l.band === band && l.level === level)?.types.find((x) => x.name === name);
  if (!t) throw new Error(`no problem type ${name} at ${band}-${level}`);
  return t;
}
