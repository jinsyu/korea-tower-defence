// Problem levels (spec "학년군별 수학 문제", 4판: times tables only, no grade band). The screen shows only the type name.
// Standard code: 2022 revised mathematics curriculum.
export type MathLevel = 1 | 2 | 3;

export type ProblemType = { name: string; standards: readonly string[] };

export type LevelRow = {
  level: MathLevel;
  /** The tables (the first factor a of a × b) asked at this level. */
  tables: readonly number[];
  /** Number ranges, as in the spec. */
  content: string;
};

export const TIMES_TABLE: ProblemType = { name: "곱셈구구", standards: ["[2수01-11]"] };

export const MATH_LEVELS: readonly LevelRow[] = [
  { level: 1, tables: [2, 5, 3, 4], content: "2·5·3·4단 (a × b, b는 1~9)" },
  { level: 2, tables: [6, 7, 8, 9], content: "6·7·8·9단" },
  { level: 3, tables: [2, 3, 4, 5, 6, 7, 8, 9], content: "2~9단 섞기" },
];
