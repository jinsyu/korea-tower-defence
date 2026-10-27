import { describe, expect, it } from "vitest";
import { clockFromEnv, wallClock } from "./clock";

describe("the server clock", () => {
  it("refuses the fast test clock in production", () => {
    expect(() => clockFromEnv({ NODE_ENV: "production", TEST_CLOCK_RATE: "60" })).toThrow("TEST_CLOCK_RATE is for tests only");
  });

  it("is the wall clock without TEST_CLOCK_RATE, and the fast one with it", () => {
    expect(clockFromEnv({ NODE_ENV: "production" })).toBe(wallClock);
    expect(clockFromEnv({ TEST_CLOCK_RATE: "60", TEST_CLOCK_FROM_MS: "0" }).rate).toBe(60);
  });
});
