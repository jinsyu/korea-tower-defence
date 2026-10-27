import { RECOVERY_CODE_WORDS } from "@ktd/core";
import { describe, expect, it } from "vitest";
import { nextDeleteStep, type DeleteAction, type DeleteStep } from "./delete-record";
import {
  FAKE_RECOVERY_CODE,
  NO_ATTEMPTS,
  RESTORE_WINDOW_MS,
  lockMinutesLeft,
  recentFails,
  tryFakeRestore,
  type RestoreResult,
} from "./fake-restore";
import {
  DIGIT_SLOT,
  EMPTY_RESTORE_INPUT,
  clearOne,
  enterDigit,
  enterWord,
  selectSlot,
  toRecoveryCode,
  type RestoreInput,
} from "./restore-input";

const typed = (s: RestoreInput, ...words: string[]) => words.reduce(enterWord, s);

describe("restore pad input (D68: only list words and digits)", () => {
  it("fills word slots in order with list words", () => {
    const s = typed(EMPTY_RESTORE_INPUT, "구름", "기차");
    expect(s.words).toEqual(["구름", "기차", "", ""]);
    expect(s.cur).toBe(2);
  });

  it.each(["홍길동", "서울시", "010", "구름 ", "<b>", "", "a"])("ignores %j in a word slot", (bad) => {
    expect(enterWord(EMPTY_RESTORE_INPUT, bad)).toBe(EMPTY_RESTORE_INPUT);
  });

  it("does not put a word into the digit slot", () => {
    const s = selectSlot(EMPTY_RESTORE_INPUT, DIGIT_SLOT);
    expect(enterWord(s, "구름")).toBe(s);
  });

  it.each(["a", "12", "", "-", "٣", "２"])("ignores %j on the number pad", (bad) => {
    expect(enterDigit(EMPTY_RESTORE_INPUT, bad)).toBe(EMPTY_RESTORE_INPUT);
  });

  it("takes two digits, and a third digit starts the pair over", () => {
    let s = enterDigit(EMPTY_RESTORE_INPUT, "2");
    s = enterDigit(s, "7");
    expect(s.digits).toBe("27");
    expect(enterDigit(s, "5").digits).toBe("5");
  });

  it("only gives a code when every slot is complete", () => {
    let s = typed(EMPTY_RESTORE_INPUT, "구름", "기차", "사과");
    expect(toRecoveryCode(s)).toBeNull();
    s = typed(s, "별빛");
    expect(toRecoveryCode(s)).toBeNull();
    s = enterDigit(enterDigit(s, "2"), "7");
    expect(toRecoveryCode(s)).toEqual(FAKE_RECOVERY_CODE);
  });

  it("clears the current slot, or steps back when it is empty", () => {
    const s = typed(EMPTY_RESTORE_INPUT, "구름", "기차");
    const back = clearOne(s);
    expect(back.words).toEqual(["구름", "", "", ""]);
    expect(back.cur).toBe(1);
    const filled = clearOne(selectSlot(s, 0));
    expect(filled.words).toEqual(["", "기차", "", ""]);
    expect(clearOne(EMPTY_RESTORE_INPUT)).toEqual(EMPTY_RESTORE_INPUT);
  });

  it("ignores slot numbers outside the five slots", () => {
    expect(selectSlot(EMPTY_RESTORE_INPUT, 5)).toBe(EMPTY_RESTORE_INPUT);
    expect(selectSlot(EMPTY_RESTORE_INPUT, -1)).toBe(EMPTY_RESTORE_INPUT);
  });
});

describe("fake restore check (stand-in for the server until T11)", () => {
  const wrong = { words: [RECOVERY_CODE_WORDS[0] ?? "", "기차", "사과", "별빛"], digits: "27" } as const;
  const MIN = 60 * 1000;
  const T0 = 1_000_000_000_000;

  /** Fails `n` times, one minute apart, starting at `start`. */
  function failTimes(n: number, start: number, from = NO_ATTEMPTS) {
    let attempts = from;
    let last: RestoreResult = "bad";
    for (let i = 0; i < n; i++) {
      const r = tryFakeRestore(wrong, attempts, start + i * MIN);
      attempts = r.attempts;
      last = r.result;
    }
    return { attempts, last };
  }

  it("accepts the right code", () => {
    expect(tryFakeRestore(FAKE_RECOVERY_CODE, NO_ATTEMPTS, T0).result).toBe("ok");
  });

  it("locks on the 10th wrong try within an hour, then refuses even the right code (D5)", () => {
    const nine = failTimes(9, T0);
    expect(nine.last).toBe("bad");
    const tenth = tryFakeRestore(wrong, nine.attempts, T0 + 9 * MIN);
    expect(tenth.result).toBe("locked");
    expect(tryFakeRestore(FAKE_RECOVERY_CODE, tenth.attempts, T0 + 10 * MIN).result).toBe("locked");
  });

  it("stays locked until just before the hour ends, and opens again at the hour", () => {
    const { attempts } = failTimes(10, T0);
    const lockedAt = T0 + 9 * MIN;
    expect(attempts.lockedUntil).toBe(lockedAt + RESTORE_WINDOW_MS);
    expect(tryFakeRestore(FAKE_RECOVERY_CODE, attempts, lockedAt + RESTORE_WINDOW_MS - 1).result).toBe("locked");
    expect(lockMinutesLeft(attempts, lockedAt + RESTORE_WINDOW_MS - 1)).toBe(1);
    expect(tryFakeRestore(FAKE_RECOVERY_CODE, attempts, lockedAt + RESTORE_WINDOW_MS).result).toBe("ok");
    expect(lockMinutesLeft(attempts, lockedAt + RESTORE_WINDOW_MS)).toBe(0);
  });

  it("starts counting from zero after a lock ends", () => {
    const { attempts } = failTimes(10, T0);
    const after = tryFakeRestore(wrong, attempts, T0 + 9 * MIN + RESTORE_WINDOW_MS);
    expect(after.result).toBe("bad");
    expect(recentFails(after.attempts, T0 + 9 * MIN + RESTORE_WINDOW_MS)).toBe(1);
  });

  it("only counts failures from the last hour", () => {
    const nine = failTimes(9, T0);
    // The first failure (at T0) is exactly an hour old here, so it no longer counts.
    const now = T0 + RESTORE_WINDOW_MS;
    const r = tryFakeRestore(wrong, nine.attempts, now);
    expect(r.result).toBe("bad");
    expect(recentFails(r.attempts, now)).toBe(9);
    // One minute before that it would have been the 10th.
    expect(tryFakeRestore(wrong, nine.attempts, now - 1).result).toBe("locked");
  });
});

describe("delete record (D8: two confirmations)", () => {
  const run = (...actions: DeleteAction[]) => actions.reduce<DeleteStep>(nextDeleteStep, "idle");

  it("deletes only after two confirmations", () => {
    expect(run("start")).toBe("first");
    expect(run("start", "confirm")).toBe("second");
    expect(run("start", "confirm", "confirm")).toBe("deleted");
  });

  it("goes back to the start on cancel at either step", () => {
    expect(run("start", "cancel")).toBe("idle");
    expect(run("start", "confirm", "cancel")).toBe("idle");
    expect(run("confirm", "confirm")).toBe("idle");
  });
});
