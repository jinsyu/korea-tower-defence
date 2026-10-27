// Korean particles picked by the last sound of the word before them (spec: no "을(를)" placeholders).
// Digits are read aloud as Sino-Korean numbers: 1 일, 2 이, 3 삼 ... and a trailing 0 is 십, 백, 천 or 만.
export type Particle = "을" | "은" | "이" | "과" | "으로" | "이에요";

const FORMS: Record<Particle, [afterConsonant: string, afterVowel: string]> = {
  을: ["을", "를"],
  은: ["은", "는"],
  이: ["이", "가"],
  과: ["과", "와"],
  으로: ["으로", "로"],
  이에요: ["이에요", "예요"],
};

type LastSound = "vowel" | "rieul" | "consonant";

const DIGIT_SOUND: Record<string, LastSound> = {
  "0": "consonant",
  "1": "rieul",
  "2": "vowel",
  "3": "consonant",
  "4": "vowel",
  "5": "vowel",
  "6": "consonant",
  "7": "rieul",
  "8": "rieul",
  "9": "vowel",
};

function lastSound(word: string): LastSound {
  const c = word.trim().at(-1) ?? "";
  const digit = DIGIT_SOUND[c];
  if (digit) return digit;
  const code = c.charCodeAt(0) - 0xac00;
  if (!(code >= 0 && code < 11172)) throw new Error(`no reading for "${c}" in "${word}"`);
  const final = code % 28;
  return final === 0 ? "vowel" : final === 8 ? "rieul" : "consonant";
}

/** The word with the particle that fits it: josa(3, "을") → "3을", josa(4, "을") → "4를". */
export function josa(word: string | number, particle: Particle): string {
  const w = String(word);
  const sound = lastSound(w);
  const [afterConsonant, afterVowel] = FORMS[particle];
  // 으로 also takes the short form after ㄹ: "1로", "7로".
  const consonant = particle === "으로" ? sound === "consonant" : sound !== "vowel";
  return w + (consonant ? afterConsonant : afterVowel);
}
