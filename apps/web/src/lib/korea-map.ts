import {
  KOREA_VIEW,
  decodeTopology,
  polygonsToPath,
  projectKorea,
  type Position,
  type Topology,
} from "@ktd/core";
import index from "../../../../data/source/gojang/regions/20261001/index.json";
import sidoTopo from "../../../../data/source/gojang/regions/20261001/korea-sido.topo.json";
import t11 from "../../../../data/source/gojang/regions/20261001/sigungu-11.topo.json";
import t12 from "../../../../data/source/gojang/regions/20261001/sigungu-12.topo.json";
import t21 from "../../../../data/source/gojang/regions/20261001/sigungu-21.topo.json";
import t22 from "../../../../data/source/gojang/regions/20261001/sigungu-22.topo.json";
import t23 from "../../../../data/source/gojang/regions/20261001/sigungu-23.topo.json";
import t25 from "../../../../data/source/gojang/regions/20261001/sigungu-25.topo.json";
import t26 from "../../../../data/source/gojang/regions/20261001/sigungu-26.topo.json";
import t29 from "../../../../data/source/gojang/regions/20261001/sigungu-29.topo.json";
import t31 from "../../../../data/source/gojang/regions/20261001/sigungu-31.topo.json";
import t32 from "../../../../data/source/gojang/regions/20261001/sigungu-32.topo.json";
import t33 from "../../../../data/source/gojang/regions/20261001/sigungu-33.topo.json";
import t34 from "../../../../data/source/gojang/regions/20261001/sigungu-34.topo.json";
import t35 from "../../../../data/source/gojang/regions/20261001/sigungu-35.topo.json";
import t37 from "../../../../data/source/gojang/regions/20261001/sigungu-37.topo.json";
import t38 from "../../../../data/source/gojang/regions/20261001/sigungu-38.topo.json";
import t39 from "../../../../data/source/gojang/regions/20261001/sigungu-39.topo.json";

export const MAP_VERSION = index.version;

/** Projected box [x0, y0, x1, y1] in map units (y grows downwards). */
export type Box = [number, number, number, number];

export type SidoShape = { code: string; name: string; box: Box; d: string };
export type RegionShape = {
  code: string;
  name: string;
  sidoCode: string;
  sidoName: string;
  box: Box;
  point: Position;
  d: string;
};
export type KoreaMap = { width: number; height: number; sido: SidoShape[]; regions: RegionShape[] };

type CodeProps = { code: string };

const SIGUNGU_TOPOS: Record<string, unknown> = {
  "11": t11, "12": t12, "21": t21, "22": t22, "23": t23, "25": t25, "26": t26, "29": t29,
  "31": t31, "32": t32, "33": t33, "34": t34, "35": t35, "37": t37, "38": t38, "39": t39,
};

function projectBox([west, south, east, north]: number[]): Box {
  const [x0, y0] = projectKorea([west!, north!]);
  const [x1, y1] = projectKorea([east!, south!]);
  return [x0, y0, x1, y1];
}

function pathsByCode(topo: Topology<CodeProps>, object: string, step: number): Map<string, string> {
  const dec = decodeTopology(topo);
  const out = new Map<string, string>();
  for (const g of topo.objects[object]!.geometries) {
    out.set(g.properties!.code, polygonsToPath(dec.polygons(g), projectKorea, step));
  }
  return out;
}

/** Steps are in projected map units (the whole country is about 980 wide). */
export function buildKoreaMap({ regionStep, sidoStep }: { regionStep: number; sidoStep: number }): KoreaMap {
  const sidoName = new Map(index.sido.map((s) => [s.code, s.name]));
  const sidoPaths = pathsByCode(sidoTopo as unknown as Topology<CodeProps>, "sido", sidoStep);
  const regionPaths = new Map<string, string>();
  for (const s of index.sido) {
    const topo = SIGUNGU_TOPOS[s.code] as Topology<CodeProps> | undefined;
    if (!topo) throw new Error(`시·도 ${s.code}의 경계 파일이 없어요.`);
    for (const [code, d] of pathsByCode(topo, "sigungu", regionStep)) regionPaths.set(code, d);
  }

  return {
    width: KOREA_VIEW.width,
    height: KOREA_VIEW.height,
    sido: index.sido.map((s) => ({ code: s.code, name: s.name, box: projectBox(s.bbox), d: sidoPaths.get(s.code) ?? "" })),
    regions: index.sigungu.map((r) => ({
      code: r.code,
      name: r.name,
      sidoCode: r.sidoCode,
      sidoName: sidoName.get(r.sidoCode) ?? "",
      box: projectBox(r.bbox),
      point: projectKorea(r.point as Position),
      d: regionPaths.get(r.code) ?? "",
    })),
  };
}
