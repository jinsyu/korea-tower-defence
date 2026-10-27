// Math text shown on screen: plain text, a stacked fraction, a small word label ("몫", "나머지") or the answer blank.
export type MathTok = string | { fr: [number, number] } | { small: string } | { blank: true };
export type MathText = MathTok[];

export const BLANK = { blank: true } as const;

/** Quotient and remainder as shown on a choice: small "몫" 7 small "나머지" 3. */
export const quotientText = (q: number, r: number): MathText => [{ small: "몫" }, String(q), { small: "나머지" }, String(r)];

/** One-line text for keys and checks: fractions as a/b, the blank as □. */
export function plainText(text: MathText): string {
  return text
    .map((t) => (typeof t === "string" ? t : "fr" in t ? `${t.fr[0]}/${t.fr[1]}` : "small" in t ? ` ${t.small} ` : "□"))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
