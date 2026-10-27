// Exact fractions for the 5~6학년 generators (no library): always in lowest terms with a positive denominator.
// Decimals are fractions whose denominator divides a power of ten, so 1.2 × 0.3 is exactly 0.36.
export type Rational = { n: number; d: number };

export const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

export function rat(n: number, d = 1): Rational {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0) throw new Error(`bad fraction ${n}/${d}`);
  const g = gcd(n, d) * Math.sign(d);
  return { n: n / g + 0, d: d / g };
}

export const add = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational) => rat(a.n * b.d, a.d * b.n);
export const eq = (a: Rational, b: Rational) => a.n === b.n && a.d === b.d;
export const isInteger = (a: Rational) => a.d === 1;

/** Whole part and proper fraction part of a positive value: 7/3 → 2, 1/3. */
export function toMixed(a: Rational): { w: number; n: number; d: number } {
  return { w: Math.floor(a.n / a.d), n: a.n % a.d, d: a.d };
}

/** w n/d as a value. */
export const mixed = (w: number, n: number, d: number) => rat(w * d + n, d);

/** Places after the decimal point, or null when the value is not a finite decimal (1/3). */
export function decimalPlaces(a: Rational): number | null {
  for (let k = 0; k <= 15; k++) if ((10 ** k) % a.d === 0) return k;
  return null;
}

/** "0.36", "8", "2.45" — no trailing zeros. Throws for values that are not finite decimals. */
export function toDecimal(a: Rational): string {
  const k = decimalPlaces(a);
  if (k === null) throw new Error(`${a.n}/${a.d} is not a finite decimal`);
  const scaled = Math.abs(a.n) * ((10 ** k) / a.d);
  const s = String(scaled).padStart(k + 1, "0");
  const text = k === 0 ? s : `${s.slice(0, -k)}.${s.slice(-k)}`;
  return (a.n < 0 ? "-" : "") + text;
}

/** "0.36" → 9/25. */
export function fromDecimal(s: string): Rational {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`not a decimal: ${s}`);
  const frac = m[2] ?? "";
  return rat(Number(m[1]! + frac), 10 ** frac.length);
}
