import { CODE_WORD_SLOTS, isCodeDigits, isCodeWord, type RecoveryCode } from "@ktd/core";

// Restore pad state. The pad is the only "free" input in the app (D68), and it only takes
// list words and digits: anything else is ignored here, whatever the screen sends.

/** Slots 0..3 are words, slot 4 is the two digits. */
export const DIGIT_SLOT = CODE_WORD_SLOTS;

export type RestoreInput = { words: readonly string[]; digits: string; cur: number };

export const EMPTY_RESTORE_INPUT: RestoreInput = { words: ["", "", "", ""], digits: "", cur: 0 };

function setWord(words: readonly string[], slot: number, word: string): string[] {
  return words.map((w, i) => (i === slot ? word : w));
}

export function selectSlot(s: RestoreInput, slot: number): RestoreInput {
  if (!Number.isInteger(slot) || slot < 0 || slot > DIGIT_SLOT) return s;
  return { ...s, cur: slot };
}

export function enterWord(s: RestoreInput, word: string): RestoreInput {
  if (s.cur >= DIGIT_SLOT || !isCodeWord(word)) return s;
  return { ...s, words: setWord(s.words, s.cur, word), cur: s.cur + 1 };
}

/** A third digit starts the pair over, like the mockup pad. */
export function enterDigit(s: RestoreInput, digit: string): RestoreInput {
  if (!/^[0-9]$/.test(digit)) return s;
  const digits = s.digits.length >= 2 ? digit : s.digits + digit;
  return { ...s, digits, cur: DIGIT_SLOT };
}

/** Clears the current slot; when it is already empty, steps back and clears the one before. */
export function clearOne(s: RestoreInput): RestoreInput {
  const filled = (slot: number) => (slot === DIGIT_SLOT ? s.digits !== "" : s.words[slot] !== "");
  const slot = filled(s.cur) || s.cur === 0 ? s.cur : s.cur - 1;
  if (slot === DIGIT_SLOT) return { ...s, digits: "", cur: slot };
  return { ...s, words: setWord(s.words, slot, ""), cur: slot };
}

/** The finished code, or null while a slot is empty or incomplete. */
export function toRecoveryCode(s: RestoreInput): RecoveryCode | null {
  if (!s.words.every(isCodeWord) || !isCodeDigits(s.digits)) return null;
  const [a, b, c, d] = s.words;
  return { words: [a, b, c, d], digits: s.digits };
}
