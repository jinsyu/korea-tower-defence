// Fake problem generator with roughly the cost of the real one (T9):
// seeded PRNG, expression string, 4 distinct choices built from typical mistakes, recent-50 check.

export interface Problem {
  id: string;
  seed: number;
  expr: string;
  key: string;
  choices: string[];
  answer: number;
  sentAt: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function build(rand: () => number): { expr: string; answer: string; wrong: string[] } {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  switch (int(0, 3)) {
    case 0: {
      const a = int(10, 999);
      const b = int(10, 999);
      const s = a + b;
      return { expr: `${a} + ${b}`, answer: `${s}`, wrong: [`${s + 10}`, `${s - 10}`, `${s + 1}`, `${s + 100}`] };
    }
    case 1: {
      const a = int(100, 999);
      const b = int(10, a - 1);
      const d = a - b;
      return { expr: `${a} − ${b}`, answer: `${d}`, wrong: [`${d + 10}`, `${d - 10}`, `${a + b}`, `${d + 1}`] };
    }
    case 2: {
      const a = int(2, 99);
      const b = int(2, 9);
      const p = a * b;
      return { expr: `${a} × ${b}`, answer: `${p}`, wrong: [`${p + b}`, `${p - b}`, `${a + b}`, `${p + 10}`] };
    }
    default: {
      const b = int(2, 9);
      const q = int(2, 99);
      const r = int(0, b - 1);
      const a = b * q + r;
      return {
        expr: `${a} ÷ ${b}`,
        answer: `몫 ${q}, 나머지 ${r}`,
        wrong: [`몫 ${q + 1}, 나머지 ${r}`, `몫 ${q}, 나머지 ${r + 1}`, `몫 ${q - 1}, 나머지 ${r + b}`, `몫 ${r}, 나머지 ${q}`],
      };
    }
  }
}

export function makeProblem(guardianId: string, seq: number, recentKeys: string[], now: number): Problem {
  const seed = (hashString(guardianId) + seq * 2654435761) >>> 0;
  const rand = mulberry32(seed);
  let made = build(rand);
  for (let tries = 0; tries < 20 && recentKeys.includes(made.expr); tries++) made = build(rand);
  const choices = [made.answer];
  for (const w of made.wrong) {
    if (choices.length === 4) break;
    if (!choices.includes(w) && !w.startsWith("-")) choices.push(w);
  }
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return {
    id: `${guardianId}:${seq}`,
    seed,
    expr: made.expr,
    key: made.expr,
    choices,
    answer: choices.indexOf(made.answer),
    sentAt: now,
  };
}
