import { describe, expect, it } from "vitest";
import { HOUR_MS } from "./dates";
import { createAddressLimits } from "./limits";

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, add: (ms: number) => (t += ms) };
};

describe("restore tries per address (D5)", () => {
  it("locks on the 10th wrong code within an hour, for an hour", () => {
    const c = clock();
    const limits = createAddressLimits("k", c.now);
    for (let i = 1; i <= 9; i++) {
      expect(limits.restoreFailed("1.2.3.4")).toEqual({ locked: false, triesLeft: 10 - i });
      c.add(60_000);
    }
    expect(limits.restoreLockLeft("1.2.3.4")).toBe(0);
    expect(limits.restoreFailed("1.2.3.4").locked).toBe(true);
    expect(limits.restoreLockLeft("1.2.3.4")).toBe(HOUR_MS);
    expect(limits.restoreLockLeft("5.6.7.8")).toBe(0);
    c.add(HOUR_MS - 1);
    expect(limits.restoreLockLeft("1.2.3.4")).toBe(1);
    c.add(1);
    expect(limits.restoreLockLeft("1.2.3.4")).toBe(0);
    // A fresh hour after the lock.
    expect(limits.restoreFailed("1.2.3.4")).toEqual({ locked: false, triesLeft: 9 });
  });

  it("a failure counted during a lock keeps the lock as it was", () => {
    const c = clock();
    const limits = createAddressLimits("k", c.now);
    for (let i = 0; i < 10; i++) limits.restoreFailed("1.2.3.4");
    c.add(1000);
    expect(limits.restoreFailed("1.2.3.4")).toEqual({ locked: true, triesLeft: 0 });
    expect(limits.restoreLockLeft("1.2.3.4")).toBe(HOUR_MS - 1000);
  });

  it("forgets failures older than an hour", () => {
    const c = clock();
    const limits = createAddressLimits("k", c.now);
    for (let i = 0; i < 9; i++) limits.restoreFailed("1.2.3.4");
    c.add(HOUR_MS);
    expect(limits.restoreFailed("1.2.3.4")).toEqual({ locked: false, triesLeft: 9 });
  });
});

describe("new guardians per address (D40)", () => {
  it("allows 60 an hour and refuses the 61st, then frees up after the hour", () => {
    const c = clock();
    const limits = createAddressLimits("k", c.now);
    for (let i = 0; i < 60; i++) {
      expect(limits.canCreate("1.2.3.4")).toBe(true);
      limits.created("1.2.3.4");
    }
    expect(limits.canCreate("1.2.3.4")).toBe(false);
    expect(limits.canCreate("9.9.9.9")).toBe(true);
    c.add(HOUR_MS);
    expect(limits.canCreate("1.2.3.4")).toBe(true);
  });
});

describe("address memory", () => {
  it("keeps a locked address no longer than the lock, an hour after its last failure", () => {
    const c = clock();
    const limits = createAddressLimits("k", c.now);
    for (let i = 0; i < 10; i++) {
      limits.restoreFailed("1.2.3.4");
      c.add(5 * 60_000);
    }
    // The 10th failure was 5 minutes ago; the first one 50 minutes before that.
    c.add(HOUR_MS - 5 * 60_000 - 1);
    limits.sweep();
    expect(limits.size()).toBe(1);
    c.add(1);
    limits.sweep();
    expect(limits.size()).toBe(0);
    limits.close();
  });

  it("drops every entry an hour after its last event", () => {
    const c = clock();
    const limits = createAddressLimits("k", c.now);
    limits.created("1.2.3.4");
    limits.restoreFailed("1.2.3.4");
    limits.sweep();
    expect(limits.size()).toBe(2);
    c.add(HOUR_MS);
    limits.sweep();
    expect(limits.size()).toBe(0);
  });
});
