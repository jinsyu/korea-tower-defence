import { RECOVERY_CODE_WORDS } from "./code-words";

// Recovery code = 4 list words + 2 digits (spec Q29). Pure helpers shared by the screens and, from T11, the server.

export const CODE_WORD_SLOTS = 4;

/** The 14 plain initial consonants, in dictionary order. Every code word starts with one of them. */
export const CODE_INITIALS = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"] as const;
export type CodeInitial = (typeof CODE_INITIALS)[number];

export type RecoveryCode = { words: readonly [string, string, string, string]; digits: string };

const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;
const SYLLABLES_PER_INITIAL = 21 * 28;

/** Initial consonant of the first syllable, or "" when the word does not start with a Hangul syllable. */
export function initialConsonant(word: string): string {
  const code = word.charCodeAt(0);
  if (!(code >= HANGUL_FIRST && code <= HANGUL_LAST)) return "";
  return CHOSEONG[Math.floor((code - HANGUL_FIRST) / SYLLABLES_PER_INITIAL)] ?? "";
}

const WORD_SET = new Set(RECOVERY_CODE_WORDS);
const WORDS_BY_INITIAL = new Map<string, string[]>(CODE_INITIALS.map((c) => [c, []]));
for (const word of RECOVERY_CODE_WORDS) WORDS_BY_INITIAL.get(initialConsonant(word))?.push(word);

export function codeWordsByInitial(initial: CodeInitial): readonly string[] {
  return WORDS_BY_INITIAL.get(initial) ?? [];
}

export function isCodeWord(value: string): boolean {
  return WORD_SET.has(value);
}

export function isCodeDigits(value: string): boolean {
  return /^[0-9]{2}$/.test(value);
}

export function isRecoveryCode(code: RecoveryCode): boolean {
  return code.words.length === CODE_WORD_SLOTS && code.words.every(isCodeWord) && isCodeDigits(code.digits);
}

/** `randomInt(n)` must return an integer in [0, n). The server passes a crypto source. */
export function makeRecoveryCode(randomInt: (n: number) => number): RecoveryCode {
  const word = () => {
    const w = RECOVERY_CODE_WORDS[randomInt(RECOVERY_CODE_WORDS.length)];
    if (w === undefined) throw new RangeError("randomInt returned a number outside [0, n)");
    return w;
  };
  return {
    words: [word(), word(), word(), word()],
    digits: String(randomInt(100)).padStart(2, "0"),
  };
}

export function formatRecoveryCode(code: RecoveryCode): string {
  return [...code.words, code.digits].join("-");
}
