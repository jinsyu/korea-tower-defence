// Math text shown on screen: plain text and the answer blank.
export type MathTok = string | { blank: true };
export type MathText = MathTok[];

export const BLANK = { blank: true } as const;

/** One-line text for keys and checks: the blank as □. */
export function plainText(text: MathText): string {
  return text
    .map((t) => (typeof t === "string" ? t : "□"))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}
