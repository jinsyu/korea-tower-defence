import { describe, expect, it } from "vitest";
import { nicknameCandidates } from "./fake-nicknames";

describe("nicknameCandidates", () => {
  it("gives three '<adjective> <noun>' names with a 4-digit tag", () => {
    const list = nicknameCandidates(3);
    expect(list).toHaveLength(3);
    for (const n of list) {
      expect(n.nick).toMatch(/^\S+ \S+$/);
      expect(n.tag).toMatch(/^\d{4}$/);
    }
  });

  it("is the same for the same seed (server and browser render match)", () => {
    expect(nicknameCandidates(7)).toEqual(nicknameCandidates(7));
  });

  it("re-rolling gives a different list", () => {
    expect(nicknameCandidates(4)).not.toEqual(nicknameCandidates(3));
  });
});
