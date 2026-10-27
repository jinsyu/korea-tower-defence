import { describe, expect, it } from "vitest";
import {
  CODE_INITIALS,
  NICK_ADJECTIVES,
  NICK_NOUNS,
  RECOVERY_CODE_WORDS,
  codeWordsByInitial,
  formatRecoveryCode,
  initialConsonant,
  isCodeDigits,
  isCodeWord,
  isRecoveryCode,
  makeRecoveryCode,
} from "./index";

// Words that must never appear whole. A first filter only; the real check is the human review (U5).
const BLOCKED_WORDS = ["엿", "돼지", "하마", "호박", "오징어", "메주", "멸치", "바보", "거지", "꼬마", "고추", "새끼", "늑대", "느림보", "맹꽁이", "원숭이"];
const BLOCKED_PARTS = ["똥", "방귀", "돼지", "바보", "멍청", "새끼", "흰둥", "깜둥", "담배", "귀신"];

function expectCleanList(list: readonly string[]) {
  expect(new Set(list).size).toBe(list.length);
  for (const w of list) {
    expect(w).toMatch(/^[가-힣]+$/);
    expect(BLOCKED_WORDS).not.toContain(w);
    for (const part of BLOCKED_PARTS) expect(w.includes(part), `${w} has ${part}`).toBe(false);
  }
}

describe("recovery code words", () => {
  it("has 1,024 distinct Hangul words (10 bits each)", () => {
    expect(RECOVERY_CODE_WORDS).toHaveLength(1024);
    expectCleanList(RECOVERY_CODE_WORDS);
  });

  it("keeps words to 3 syllables so five tiles fit on a 360px phone", () => {
    const tooLong = RECOVERY_CODE_WORDS.filter((w) => w.length > 3);
    expect(tooLong).toEqual([]);
  });

  it("starts every word with one of the 14 plain consonants, so the pad groups all of them", () => {
    const grouped = CODE_INITIALS.flatMap((c) => codeWordsByInitial(c));
    expect(grouped).toHaveLength(1024);
    expect(new Set(grouped)).toEqual(new Set(RECOVERY_CODE_WORDS));
  });

  it("includes the mockup example code words", () => {
    for (const w of ["구름", "기차", "사과", "별빛"]) expect(isCodeWord(w)).toBe(true);
  });
});

describe("nickname words", () => {
  it("are distinct, Hangul only and pass the blocked-word filter", () => {
    expectCleanList(NICK_ADJECTIVES);
    expectCleanList(NICK_NOUNS);
    for (const adj of NICK_ADJECTIVES) expect(adj).toMatch(/[ㄴ-ㅎ가-힣]$/);
  });
});

describe("initialConsonant", () => {
  it("reads the initial of the first syllable", () => {
    expect(initialConsonant("구름")).toBe("ㄱ");
    expect(initialConsonant("하늘")).toBe("ㅎ");
    expect(initialConsonant("딸기")).toBe("ㄸ");
    expect(initialConsonant("abc")).toBe("");
    expect(initialConsonant("")).toBe("");
  });
});

describe("restore code checks", () => {
  it("accepts only list words in the word slots", () => {
    expect(isCodeWord("구름")).toBe(true);
    expect(isCodeWord("홍길동")).toBe(false);
    expect(isCodeWord("구름 ")).toBe(false);
    expect(isCodeWord("27")).toBe(false);
    expect(isCodeWord("")).toBe(false);
  });

  it("accepts exactly two digits in the number slot", () => {
    expect(isCodeDigits("27")).toBe(true);
    expect(isCodeDigits("07")).toBe(true);
    expect(isCodeDigits("7")).toBe(false);
    expect(isCodeDigits("123")).toBe(false);
    expect(isCodeDigits("２７")).toBe(false);
    expect(isCodeDigits("ab")).toBe(false);
  });

  it("checks a whole code", () => {
    expect(isRecoveryCode({ words: ["구름", "기차", "사과", "별빛"], digits: "27" })).toBe(true);
    expect(isRecoveryCode({ words: ["구름", "기차", "사과", "철수"], digits: "27" })).toBe(false);
    expect(isRecoveryCode({ words: ["구름", "기차", "사과", "별빛"], digits: "2" })).toBe(false);
  });
});

describe("makeRecoveryCode", () => {
  it("builds a valid code from the random source", () => {
    let i = 0;
    const picks = [0, 1023, 5, 9, 7];
    const code = makeRecoveryCode(() => picks[i++] ?? 0);
    expect(isRecoveryCode(code)).toBe(true);
    expect(code.words[0]).toBe(RECOVERY_CODE_WORDS[0]);
    expect(code.words[1]).toBe(RECOVERY_CODE_WORDS[1023]);
    expect(code.digits).toBe("07");
  });

  it("formats as words and digits joined by hyphens", () => {
    expect(formatRecoveryCode({ words: ["구름", "기차", "사과", "별빛"], digits: "27" })).toBe("구름-기차-사과-별빛-27");
  });
});
