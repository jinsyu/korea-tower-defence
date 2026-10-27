import { describe, expect, it } from "vitest";
import { createCodeHandoff } from "./code-handoff";

const A = { words: ["구름", "기차", "사과", "별빛"], digits: "27" } as const;
const B = { words: ["가방", "가위", "가지", "가을"], digits: "03" } as const;

describe("recovery code handoff (D4: shown once per issue)", () => {
  it("gives an issued code to its screen until the screen takes it", () => {
    const h = createCodeHandoff();
    const id = h.issue(A);
    expect(h.peek(id)).toEqual(A);
    h.take(id);
    // Coming back to the same issue (back/forward, a kept-alive screen) finds nothing.
    expect(h.peek(id)).toBeNull();
  });

  it("a second guardian's code gets a new issue id, so a kept screen of the first issue starts over", () => {
    const h = createCodeHandoff();
    const first = h.issue(A);
    h.take(first);
    const second = h.issue(B);
    expect(second).not.toBe(first);
    // The old screen's late take does not touch the new code.
    h.take(first);
    expect(h.peek(first)).toBeNull();
    expect(h.peek(second)).toEqual(B);
    h.take(second);
    expect(h.peek(second)).toBeNull();
  });
});
