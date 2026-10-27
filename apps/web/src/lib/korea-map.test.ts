import { describe, expect, it } from "vitest";
import { buildKoreaMap } from "@/lib/korea-map";

describe("buildKoreaMap", () => {
  const map = buildKoreaMap({ regionStep: 0.5, sidoStep: 1.5 });

  it("has all 185 regions with unique codes and drawable paths", () => {
    expect(map.regions).toHaveLength(185);
    expect(new Set(map.regions.map((r) => r.code)).size).toBe(185);
    for (const r of map.regions) {
      expect(r.d).toMatch(/^M[\d.]+ [\d.]+L/);
      expect(r.name).not.toBe("");
    }
  });

  it("puts every region under one of the 16 sido", () => {
    expect(map.sido).toHaveLength(16);
    const sidoCodes = new Set(map.sido.map((s) => s.code));
    for (const r of map.regions) expect(sidoCodes.has(r.sidoCode)).toBe(true);
    for (const s of map.sido) expect(s.d.length).toBeGreaterThan(0);
  });

  it("lists all 25 Seoul districts so each can be picked", () => {
    expect(map.regions.filter((r) => r.sidoCode === "11")).toHaveLength(25);
  });

  it("keeps projected label points and boxes inside the view", () => {
    for (const r of map.regions) {
      const [x, y] = r.point;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(map.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(map.height);
      const [x0, y0, x1, y1] = r.box;
      expect(x1).toBeGreaterThan(x0);
      expect(y1).toBeGreaterThan(y0);
    }
  });
});

describe("map file URLs", () => {
  it("point at the current boundary version (the route folders are named after it)", async () => {
    const { HOME_MAP_URL, KOREA_MAP_URL } = await import("@/lib/korea-map-url");
    const { MAP_VERSION } = await import("@/lib/korea-map");
    expect(KOREA_MAP_URL).toBe(`/map/${MAP_VERSION}/korea.json`);
    expect(HOME_MAP_URL).toBe(`/map/${MAP_VERSION}/home.svg`);
  });
});
