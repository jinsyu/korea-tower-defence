import { describe, expect, it } from "vitest";
import { KOREA_VIEW, decodeTopology, polygonsToPath, projectKorea, type Topology } from "./topo";

// Two unit squares sharing the arc x=1 (arc 1), quantized with scale 0.5.
const topo: Topology = {
  type: "Topology",
  transform: { scale: [0.5, 0.5], translate: [10, 20] },
  arcs: [
    [[2, 0], [-2, 0], [0, 2], [2, 0]], // (11,20) (10,20) (10,21) (11,21)
    [[2, 2], [0, -2]], // (11,21) (11,20)
    [[2, 2], [2, 0], [0, -2], [-2, 0]], // (11,21) (12,21) (12,20) (11,20)
  ],
  objects: {
    cells: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", arcs: [[0, 1]], properties: { code: "A" } },
        { type: "MultiPolygon", arcs: [[[2, -2]]], properties: { code: "B" } },
      ],
    },
  },
};

describe("decodeTopology", () => {
  const dec = decodeTopology(topo);
  const [a, b] = topo.objects.cells!.geometries;

  it("delta-decodes quantized arcs and joins them into closed rings", () => {
    expect(dec.polygons(a!)).toEqual([[[[11, 20], [10, 20], [10, 21], [11, 21], [11, 20]]]]);
  });

  it("walks a negative arc index backwards (~i)", () => {
    expect(dec.polygons(b!)).toEqual([[[[11, 21], [12, 21], [12, 20], [11, 20], [11, 21]]]]);
  });
});

describe("projectKorea", () => {
  it("puts the north-west corner at the origin and fits the whole country in the view", () => {
    expect(projectKorea([124.45, 38.72])).toEqual([0, 0]);
    const [x, y] = projectKorea([132, 33.05]);
    expect(Math.round(x)).toBe(KOREA_VIEW.width);
    expect(Math.round(y)).toBe(KOREA_VIEW.height);
  });
});

describe("polygonsToPath", () => {
  const identity = (p: [number, number]) => p;

  it("writes one closed subpath per ring", () => {
    const d = polygonsToPath([[[[0, 0], [10, 0], [10, 10], [0, 0]]]], identity, 0);
    expect(d).toBe("M0 0L10 0L10 10L0 0Z");
  });

  it("drops points closer than minStep but keeps the closing point", () => {
    const ring: [number, number][] = [[0, 0], [0.1, 0], [10, 0], [10, 10], [0, 0.1]];
    expect(polygonsToPath([[ring]], identity, 1)).toBe("M0 0L10 0L10 10L0 0.1Z");
  });

  it("skips rings that collapse to fewer than three points", () => {
    expect(polygonsToPath([[[[0, 0], [0.1, 0.1], [0, 0]]]], identity, 1)).toBe("");
  });
});
