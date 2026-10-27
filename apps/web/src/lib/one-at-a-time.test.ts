import { describe, expect, it } from "vitest";
import { oneAtATime } from "./one-at-a-time";

describe("one save at a time (my-guardian picks)", () => {
  it("drops a second pick while the first is on its way, and takes picks again after it lands", async () => {
    const sent: string[] = [];
    let land: () => void = () => undefined;
    const save = oneAtATime(async (pick: string) => {
      sent.push(pick);
      await new Promise<void>((resolve) => (land = resolve));
    });
    const first = save("slow");
    expect(await save("rapid")).toBe(false);
    land();
    expect(await first).toBe(true);
    const third = save("rapid");
    land();
    expect(await third).toBe(true);
    expect(sent).toEqual(["slow", "rapid"]);
  });

  it("takes picks again after a failed save", async () => {
    const save = oneAtATime(async (fail: boolean) => {
      if (fail) throw new Error("server");
    });
    await expect(save(true)).rejects.toThrow("server");
    expect(await save(false)).toBe(true);
  });
});
