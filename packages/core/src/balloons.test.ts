import { describe, expect, it } from "vitest";
import { BALLOON_KINDS, balloonHealthState } from "./balloons";

describe("balloon kinds (D78)", () => {
  it("size ratio is 1 : 0.8 : 1.25 : 1.9", () => {
    expect(BALLOON_KINDS.map((k) => k.scale)).toEqual([1, 0.8, 1.25, 1.9]);
  });

  it("each kind has its own shape", () => {
    expect(new Set(BALLOON_KINDS.map((k) => k.shape)).size).toBe(4);
  });
});

describe("balloonHealthState (D78)", () => {
  it("boss gets one tape at 66% and two tapes with wrinkles at 33%", () => {
    expect(balloonHealthState("boss", 0.67)).toEqual({ tapes: 0, wrinkled: false, bandBroken: false });
    expect(balloonHealthState("boss", 0.66)).toEqual({ tapes: 1, wrinkled: false, bandBroken: false });
    expect(balloonHealthState("boss", 0.34)).toEqual({ tapes: 1, wrinkled: false, bandBroken: false });
    expect(balloonHealthState("boss", 0.33)).toEqual({ tapes: 2, wrinkled: true, bandBroken: false });
  });

  it("king breaks one band at 50%", () => {
    expect(balloonHealthState("king", 0.51).bandBroken).toBe(false);
    expect(balloonHealthState("king", 0.5).bandBroken).toBe(true);
  });

  it("small balloons never change", () => {
    for (const kind of ["normal", "fast"] as const) {
      expect(balloonHealthState(kind, 0.1)).toEqual({ tapes: 0, wrinkled: false, bandBroken: false });
    }
  });
});
