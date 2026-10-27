import { describe, expect, it } from "vitest";
import { formatBig } from "./format";

describe("formatBig: Korean big numbers (D61)", () => {
  it.each([
    [0, "0"],
    [7, "7"],
    [9999, "9,999"],
    [10000, "1만"],
    [12345, "1.2만"],
    [12000, "1.2만"],
    [99_999, "9.9만"],
    [9_999_999, "999.9만"],
    [10_000_000, "1,000만"],
    [12_345_678, "1,234만"],
    [99_999_999, "9,999만"],
    [100_000_000, "1억"],
    [345_000_000, "3.4억"],
    [8.2e12, "8.2조"],
    [1e16, "1경"],
    [1.23e16, "1.2경"],
    [9_999.9e16, "9,999경"],
    [1e20, "1 × 10²⁰"],
    [1.2e20, "1.2 × 10²⁰"],
    [3.4e123, "3.4 × 10¹²³"],
  ])("%d -> %s", (n, text) => {
    expect(formatBig(n)).toBe(text);
  });

  // The double right below / right above x (the closest a float can get to a boundary).
  const nextDouble = (x: number, dir: 1 | -1) => {
    const v = new DataView(new ArrayBuffer(8));
    v.setFloat64(0, x);
    v.setBigUint64(0, v.getBigUint64(0) + BigInt(dir));
    return v.getFloat64(0);
  };

  it.each([
    [1e4, "9,999", "1만", "1만"],
    [1e8, "9,999만", "1억", "1억"],
    [1e12, "9,999억", "1조", "1조"],
    [1e16, "9,999조", "1경", "1경"],
    [1e20, "9,999경", "1 × 10²⁰", "1 × 10²⁰"],
    [1e21, "9.9 × 10²⁰", "1 × 10²¹", "1 × 10²¹"],
  ])("never reads bigger around %d: just below, exact, just above", (x, below, exact, above) => {
    expect(formatBig(nextDouble(x, -1))).toBe(below);
    expect(formatBig(x)).toBe(exact);
    expect(formatBig(nextDouble(x, 1))).toBe(above);
  });

  it("keeps the value under the boundary for far-below integers too", () => {
    expect(formatBig(1e20 - 16384)).toBe("9,999경");
    expect(formatBig(1e21 - 131072)).toBe("9.9 × 10²⁰");
    expect(formatBig(19_999)).toBe("1.9만");
  });

  it("cuts digits instead of rounding up, so a number never reads bigger", () => {
    expect(formatBig(1234.9)).toBe("1,234");
    expect(formatBig(34_999)).toBe("3.4만");
  });

  it("stays short enough for one line at 360px (11 characters or fewer, 9.9 × 10³⁰⁰) from 1 to 10³⁰⁰", () => {
    let longest = "";
    for (let e = 0; e <= 300; e += 0.01) {
      const s = formatBig(Math.pow(10, e));
      if (s.length > longest.length) longest = s;
    }
    expect(longest.length).toBeLessThanOrEqual(11);
  });
});
