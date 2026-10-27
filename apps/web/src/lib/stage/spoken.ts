// Spoken form of math text for screen readers.
import { josa, type MathText } from "@ktd/core";

/**
 * The blank reads "빈칸". "=" reads 은 or 는 after the word before it as spoken: "7 곱하기 8은 빈칸".
 */
export function spoken(text: MathText): string {
  return text
    .map((t) => (typeof t === "string" ? t.replaceAll("×", " 곱하기 ").replaceAll("=", " = ") : " 빈칸 "))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/(\S+) = ?/g, (_, word: string) => `${josa(word, "은")} `)
    .trim();
}
