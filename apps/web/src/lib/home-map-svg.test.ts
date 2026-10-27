import { describe, expect, it } from "vitest";
import { homeMapSvg } from "@/lib/home-map-svg";

describe("homeMapSvg", () => {
  it("draws all 185 regions as one standalone SVG", () => {
    const svg = homeMapSvg();
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.match(/<path /g)).toHaveLength(185);
  });
});
