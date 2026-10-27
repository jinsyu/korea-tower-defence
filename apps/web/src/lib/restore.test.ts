import { describe, expect, it } from "vitest";
import { nextDeleteStep, type DeleteAction, type DeleteStep } from "./delete-record";
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
    expect(toRecoveryCode(s)).toEqual({ words: ["구름", "기차", "사과", "별빛"], digits: "27" });
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
