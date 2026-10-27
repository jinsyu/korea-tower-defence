// Spoken form of math text for screen readers.
import { josa, type MathText } from "@ktd/core";

/**
 * Fractions read "4분의 3", mixed numbers "1과 4분의 3", the blank reads "빈칸". "=" reads 은 or 는 after the word
 * before it as spoken: "3.6은", "4분의 3은", "빈칸 곱하기 2는".
 */
export function spoken(text: MathText): string {
  return text
    .map((t) => {
      if (typeof t === "string") return t.replaceAll("×", " 곱하기 ").replaceAll("÷", " 나누기 ").replaceAll("−", " 빼기 ").replaceAll("+", " 더하기 ").replaceAll("=", " = ");
      if ("fr" in t) return ` ${t.w === undefined ? "" : `${josa(t.w, "과")} `}${t.fr[1]}분의 ${t.fr[0]} `;
      if ("small" in t) return ` ${t.small} `;
      return " 빈칸 ";
    })
    .join("")
    .replace(/\s+/g, " ")
    .replace(/(\S+) = ?/g, (_, word: string) => `${josa(word, "은")} `)
    .trim();
}
