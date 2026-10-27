// Tower look rules (spec "타워 겉모습과 에셋"). Big changes (silhouette) are rare and early,
// small ones (ornament) frequent. The colour a child picks is not an input here on purpose:
// it only paints the body and never affects material or tier.

export const TOWER_TYPES = ["rapid", "splash", "slow"] as const;
export type TowerType = (typeof TOWER_TYPES)[number];

export const EVO_AT = [1, 25, 100, 200, 500] as const;
export const EVO_NAMES = ["I 기본형", "II 개량형", "III 전문형", "IV 전설형", "V 전설+"] as const;
export const MAT_AT = [1, 10, 25, 50, 100, 150, 200, 300, 400, 500] as const;
export const MAT_NAMES = ["나무", "돌", "철", "청동", "은", "강철", "금", "수정", "자수정", "프리즘"] as const;
export const TIER_AT = [1, 50, 100, 200, 300, 500] as const;
export const TIER_NAMES = ["흰", "초록", "파랑", "보라", "주황", "금"] as const;

export type Look = {
  step: number;
  /** Evolution stage 0..4 (silhouette). */
  evo: number;
  /** Material grade 0..9. */
  mat: number;
  /** Tier (base rim colour + effect) 0..5. */
  tier: number;
  /** Body variant 0..19, every 25 steps. */
  body: number;
  /** Barrel 0..9, every 10 steps. */
  bar: number;
  /** Ornament 0..19 every 5 steps, -1 before step 5. */
  orn: number;
  /** Stars, one per 500 steps. */
  star: number;
  /** Position inside the 5-step bundle, 0..4 (dots shown at 88px and up). */
  dot: number;
};

function indexAt(at: readonly number[], s: number): number {
  let i = 0;
  for (let k = 0; k < at.length; k++) if (s >= at[k]!) i = k;
  return i;
}

export function lookOf(step: number): Look {
  const s = Math.max(1, Math.floor(step));
  return {
    step: s,
    evo: indexAt(EVO_AT, s),
    mat: indexAt(MAT_AT, s),
    tier: indexAt(TIER_AT, s),
    body: Math.min(19, Math.floor(s / 25)),
    bar: Math.floor(s / 10) % 10,
    orn: s < 5 ? -1 : Math.floor(s / 5) % 20,
    star: Math.floor(s / 500),
    dot: s % 5,
  };
}

/** Everything that changes the picture except the step number badge. */
export function lookKey(type: TowerType, step: number): string {
  const L = lookOf(step);
  return [type, L.evo, L.mat, L.tier, L.body, L.bar, L.orn, L.star].join(".");
}

const SIZE_TABLE: readonly (readonly [number, number])[] = [
  [1, 0.72],
  [5, 0.74],
  [10, 0.8],
  [25, 0.86],
  [50, 0.92],
  [100, 1],
];

/** Tower size relative to its spot. After 100 only height grows (evolution IV, see the art code). */
export function sizeOf(step: number): number {
  const s = Math.max(1, step);
  for (let i = 1; i < SIZE_TABLE.length; i++) {
    const [b, vb] = SIZE_TABLE[i]!;
    if (s < b) {
      const [a, va] = SIZE_TABLE[i - 1]!;
      return va + ((vb - va) * (s - a)) / (b - a);
    }
  }
  return 1;
}

const ALL_THRESHOLDS = [...new Set<number>([...EVO_AT, ...MAT_AT, ...TIER_AT])].sort((a, b) => a - b);

export type NextLook = { step: number; left: number; text: string };

/** The next evolution / material / tier threshold, e.g. "50단계에 청동 타워 · 초록 테두리". */
export function nextLook(step: number): NextLook | null {
  const n = ALL_THRESHOLDS.find((v) => v > step);
  if (n === undefined) return null;
  const now = lookOf(step);
  const next = lookOf(n);
  const parts: string[] = [];
  if (next.evo > now.evo) parts.push(EVO_NAMES[next.evo]!);
  if (next.mat > now.mat) parts.push(`${MAT_NAMES[next.mat]} 타워`);
  if (next.tier > now.tier) parts.push(`${TIER_NAMES[next.tier]} 테두리`);
  return { step: n, left: n - step, text: `${n}단계에 ${parts.join(" · ")}` };
}
