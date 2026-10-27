// Math text shown on screen: plain text, a stacked fraction, a small word label ("몫", "나머지") or the answer blank.
import { decimalPlaces, toDecimal, toMixed, type Rational } from "./rational";

/** A stacked fraction [numerator, denominator]; `w` is the whole part of a mixed number (its fraction is proper). */
export type FractionTok = { fr: [number, number]; w?: number };
export type MathTok = string | FractionTok | { small: string } | { blank: true };
export type MathText = MathTok[];

export const BLANK = { blank: true } as const;

/** Quotient and remainder as shown on a choice: small "몫" 7 small "나머지" 3. */
export const quotientText = (q: number, r: number): MathText => [{ small: "몫" }, String(q), { small: "나머지" }, String(r)];

/** A stacked fraction as written, not reduced: fr(8, 12) shows 8 over 12. */
export const fr = (n: number, d: number): FractionTok => ({ fr: [n, d] });

/** A value in lowest terms: a whole number, a proper fraction or a mixed number (2 1/3), never 7/3. */
export function fractionText(v: Rational): MathText {
  const { w, n, d } = toMixed(v);
  if (n === 0) return [String(w)];
  return [w === 0 ? fr(n, d) : { fr: [n, d], w }];
}

/** n/d as worked out, then " = " and the value in lowest terms when that looks different: 9/12 = 3/4, 7/12. */
export function resultText(n: number, d: number, value: Rational): MathText {
  const shown = fractionText(value);
  return plainText(shown) === `${n}/${d}` ? shown : [fr(n, d), " = ", ...shown];
}

/** A finite decimal such as "0.36". */
export function decimalText(v: Rational): MathText {
  if (decimalPlaces(v) === null) throw new Error(`${v.n}/${v.d} is not a finite decimal`);
  return [toDecimal(v)];
}

/** One-line text for keys and checks: fractions as a/b, mixed numbers as w a/b, the blank as □. */
export function plainText(text: MathText): string {
  return text
    .map((t) =>
      typeof t === "string" ? t : "fr" in t ? `${t.w === undefined ? "" : `${t.w} `}${t.fr[0]}/${t.fr[1]}` : "small" in t ? ` ${t.small} ` : "□",
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
