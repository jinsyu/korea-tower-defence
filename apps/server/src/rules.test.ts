import { describe, expect, it } from "vitest";
import { addDays, DAY_MS, kstDate, kstMidnight } from "./dates";
import { regionChangeStatus } from "./rules";

// D7 boundaries. First pick at 2026-10-27 15:00 KST.
const pickedAt = Date.parse("2026-10-27T06:00:00Z");

describe("region change rule (D7)", () => {
  it("allows one free change right up to 24 hours after the first pick", () => {
    expect(regionChangeStatus(pickedAt, null, pickedAt + 1000)).toEqual({ allowed: true, nextOn: null });
    expect(regionChangeStatus(pickedAt, null, pickedAt + DAY_MS - 1)).toEqual({ allowed: true, nextOn: null });
  });

  it("from 24 hours on waits for 30 days after the first pick day", () => {
    expect(regionChangeStatus(pickedAt, null, pickedAt + DAY_MS)).toEqual({ allowed: false, nextOn: "2026-11-26" });
  });

  it("opens again on the 30th day, not a moment before (00:00 KST)", () => {
    const open = kstMidnight("2026-11-26");
    expect(regionChangeStatus(pickedAt, null, open - 1)).toEqual({ allowed: false, nextOn: "2026-11-26" });
    expect(regionChangeStatus(pickedAt, null, open)).toEqual({ allowed: true, nextOn: null });
  });

  it("after the free change, even inside the first day, the next one is 30 days after that change", () => {
    const changedOn = kstDate(pickedAt + 1000);
    expect(regionChangeStatus(pickedAt, changedOn, pickedAt + 2000)).toEqual({ allowed: false, nextOn: "2026-11-26" });
  });

  it("a later change counts 30 days from its own day", () => {
    const changedOn = "2027-01-10";
    expect(regionChangeStatus(pickedAt, changedOn, kstMidnight("2027-02-09") - 1)).toEqual({ allowed: false, nextOn: "2027-02-09" });
    expect(regionChangeStatus(pickedAt, changedOn, kstMidnight("2027-02-09"))).toEqual({ allowed: true, nextOn: null });
  });
});

describe("KST days", () => {
  it("turns over at 00:00 KST (15:00 UTC)", () => {
    expect(kstDate(Date.parse("2026-10-27T14:59:59.999Z"))).toBe("2026-10-27");
    expect(kstDate(Date.parse("2026-10-27T15:00:00Z"))).toBe("2026-10-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
