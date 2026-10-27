import { describe, expect, it } from "vitest";
import { boardTowers, pickRepresentatives, placeTowers, type Guardian } from "./reps.ts";

const g = (id: string, pts24: number, step = 1, joinedAt = 0): Guardian => ({ id, nick: id, tag: "0001", type: "rapid", step, pal: 0, pts24, joinedAt });

describe("representatives (D21)", () => {
  it("takes the top N by points in the last 24 hours", () => {
    const list = [g("a", 10), g("b", 50), g("c", 30), g("d", 40)];
    expect(pickRepresentatives(list, 3).map((x) => x.id)).toEqual(["b", "d", "c"]);
  });

  it("breaks a tie by the higher tower step, then by who came first", () => {
    const list = [g("late-low", 20, 3, 9), g("late-high", 20, 8, 7), g("early-high", 20, 8, 2), g("top", 99, 1, 5)];
    expect(pickRepresentatives(list, 4).map((x) => x.id)).toEqual(["top", "early-high", "late-high", "late-low"]);
  });

  it("never picks a guardian with no points in 24 hours; the rest of the spots stay empty", () => {
    const list = [g("zero-high", 0, 500, 0), g("one", 1, 1, 9), g("zero", 0, 1, 1)];
    expect(pickRepresentatives(list, 6).map((x) => x.id)).toEqual(["one"]);
    const towers = boardTowers(list, g("me", 0), 6);
    expect(towers.filter((t) => t.spot === "rep")).toHaveLength(1);
  });
});

describe("towers for a picked list (D22)", () => {
  it("draws my newer tower on my representative spot, or on my spot when I am not one", () => {
    const reps = [g("a", 90), g("me", 50, 3), g("b", 40)];
    const me = g("me", 0, 12);
    const placed = placeTowers(reps, me, 2);
    expect(placed.map((t) => [t.guardian.id, t.spot, t.me])).toEqual([
      ["a", "rep", false],
      ["me", "rep", true],
    ]);
    expect(placed[1]!.guardian).toMatchObject({ step: 12, pts24: 50 });
    const notRep = placeTowers([g("a", 90), g("b", 40)], me, 2);
    expect(notRep.at(-1)).toMatchObject({ spot: "mine", me: true });
    expect(notRep).toHaveLength(3);
  });

  it("draws at most N + 1 towers however long the list is", () => {
    const reps = Array.from({ length: 1000 }, (_, i) => g(`g${i}`, 1000 - i));
    expect(placeTowers(reps, g("me", 0), 8)).toHaveLength(9);
    expect(placeTowers(reps, { ...reps[3]!, step: 40 }, 8)).toHaveLength(8);
  });
});
